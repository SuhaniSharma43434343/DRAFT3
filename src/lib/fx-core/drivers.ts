/**
 * fx-core/drivers.ts. THE property-driver layer.
 *
 * Pipeline: normalize -> remap -> shape -> smooth -> sink.
 *
 * Law 2 of the contract lives here: ONE ticker, ONE driver layer, ONE motion gate.
 * Twelve skills each running their own requestAnimationFrame is twelve motion bugs
 * and twelve reduced-motion regressions. Nothing in this file calls rAF.
 *
 * Scope is deliberately a 4x3 matrix of functions (4 sources x 3 sinks), not an engine.
 * If this ever needs a graph editor, it has failed. Everything is scalar: drive a vec2
 * with two drivers, not with a type parameter.
 */

// Sibling contracts. ticker.ts and motion.ts own these names.
//   ./ticker  subscribe(fn: (dt: number, elapsed: number) => void): Unsubscribe
//             dt and elapsed are SECONDS, positional. The returned function unsubscribes.
//   ./motion  prefersReducedMotion(): boolean
import { subscribe } from './ticker'
import { prefersReducedMotion } from './motion'

// ─── util (no d3-interpolate for scalars) ────────────────────────────────────

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
export const clamp01 = (v: number): number => clamp(v, 0, 1)
export const map = (v: number, a: number, b: number, c: number, d: number): number =>
  a === b ? c : c + ((v - a) / (b - a)) * (d - c)
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01(a === b ? 0 : (v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

// ─── sources ─────────────────────────────────────────────────────────────────

/** Autonomous. Runs on its own. The ONLY source the reduced-motion gate freezes. */
export interface TimeSource {
  type: 'time'
  /** Multiplies elapsed seconds before remap. Default 1. */
  speed?: number
}

/** Direct manipulation. Normalized against the viewport, never an element rect. */
export interface PointerSource {
  type: 'pointer'
  /** x|y are 0..1 viewport coords. vx|vy are viewport-widths per second. */
  axis: 'x' | 'y' | 'vx' | 'vy'
}

/** Direct manipulation. Element progress through the viewport, 0..1. */
export interface ScrollSource {
  type: 'scroll'
  element: HTMLElement
  /** cover: 0 = top edge at viewport bottom, 1 = bottom edge at viewport top. Default cover. */
  range?: 'cover' | 'contain'
}

/** Direct manipulation. Any external reactive scalar, sampled once per tick. */
export interface StateSource {
  type: 'state'
  read: () => number
}

export type DriverSource = TimeSource | PointerSource | ScrollSource | StateSource

// Shared pointer state, refcounted. Four pointer drivers must not mean four listeners.
// Lazily attached on the first start(); nothing runs at import time.
let pointerRefs = 0
const pointer = { x: 0.5, y: 0.5 }

function onPointerMove(e: PointerEvent): void {
  pointer.x = e.clientX / Math.max(window.innerWidth, 1)
  pointer.y = e.clientY / Math.max(window.innerHeight, 1)
}

function acquirePointer(): void {
  if (pointerRefs++ === 0) window.addEventListener('pointermove', onPointerMove, { passive: true })
}

function releasePointer(): void {
  pointerRefs = Math.max(0, pointerRefs - 1)
  if (pointerRefs === 0) window.removeEventListener('pointermove', onPointerMove)
}

// getBoundingClientRect forces layout. It is affordable here precisely BECAUSE of law 2:
// every driver reads in the same ticker phase, so the page flushes layout once per frame,
// not once per effect.
function scrollProgress(el: HTMLElement, range: 'cover' | 'contain'): number {
  const r = el.getBoundingClientRect()
  const vh = Math.max(window.innerHeight, 1)
  if (range === 'contain') {
    const travel = r.height - vh
    return travel <= 0 ? clamp01(-r.top / Math.max(r.height, 1)) : clamp01(-r.top / travel)
  }
  return clamp01((vh - r.top) / Math.max(vh + r.height, 1))
}

// ─── shaping: Penner easing equations, MIT branch ────────────────────────────
// Normalized restatements of the published equations, not a vendored easing pack.
// Four, not thirty. A hero that needs a fifth easing needs a different idea.
//
// Shape is POSITIONAL: a curve over a known 0..1 parameter. It is not physics.
// springish is the only way to get overshoot, because neither smoother overshoots.
// Shape is only meaningful when remap.clamp is true; outside 0..1 an easing is undefined.

export type ShapeFn = (t: number) => number
export type ShapeName = 'linear' | 'easeOut' | 'easeInOut' | 'springish'

export const shapes: Record<ShapeName, ShapeFn> = {
  linear: (t) => t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  // Penner easeOutElastic. Analytic spring approximation: overshoots, settles exactly on 1.
  springish: (t) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
  },
}

// ─── smoothing ───────────────────────────────────────────────────────────────

export type SmoothFn = (target: number, dt: number) => number

export type Smoothing =
  | { type: 'expDecay'; lambda?: number }
  | { type: 'oneEuro'; minCutoff?: number; beta?: number; dCutoff?: number }

/* ═════════════════════════════════════════════════════════════════════════════
 * THE FIX. This function is the reason this file exists.
 *
 *   WRONG:   v += (target - v) * 0.1
 *
 *   That 0.1 means "close 10% of the remaining distance PER FRAME", so the
 *   convergence rate is welded to how often the frame fires. Over 100ms a 60Hz
 *   panel runs the line ~6 times and closes ~47% of the gap; a 120Hz ProMotion
 *   display runs it ~12 times and closes ~72%. Same code, same 100ms, different
 *   result: THE HERO LITERALLY FEELS DIFFERENT PER DEVICE. Snappy on the new
 *   phone, sluggish on the old one, and nobody can reproduce the bug report.
 *   It also has no defence against a dt spike (tab restore, GC pause, a hitch):
 *   the loop just keeps stepping at a fixed fraction with no notion of time.
 *
 *   RIGHT:   v = target + (v - target) * Math.exp(-lambda * dt)
 *
 *   The exact solution to dv/dt = -lambda * (v - target). Frame-rate independent
 *   by construction: dt carries the time, lambda carries the rate. Unconditionally
 *   stable for every dt >= 0, because exp(-lambda*dt) is always in (0, 1]. A 10
 *   second dt spike snaps cleanly to target instead of exploding.
 *
 *   lambda is in units of 1/seconds and is the only knob. For a half-life of h
 *   seconds, lambda = ln(2)/h. lambda 10 is a tight UI follow; lambda 2 is drift.
 *
 *   Refs: Freya Holmer, "Lerp smoothing is broken" (2024).
 *         Rory Driscoll, "Frame rate independent damping using lerp" (2016).
 * ═══════════════════════════════════════════════════════════════════════════ */
export function createExpDecay(lambda = 8): SmoothFn {
  let v = 0
  let primed = false
  return (target, dt) => {
    if (!primed) {
      primed = true
      v = target
      return v
    }
    if (!(dt > 0)) return v
    v = target + (v - target) * Math.exp(-lambda * dt)
    return v
  }
}

/**
 * The 1 Euro filter, an adaptive low-pass. Use for pointer, where expDecay forces the
 * jitter/lag trade-off: slow lambda is smooth but laggy, fast lambda is responsive but
 * jittery. 1 Euro raises the cutoff with speed, so a still pointer is smoothed hard and
 * a fast pointer is barely filtered at all.
 *
 * Derived from the published maths, not from the Inria reference source:
 *   Casiez, Roussel & Vogel, "1 Euro Filter: A Simple Speed-based Low-pass Filter for
 *   Noisy Input in Interactive Systems", CHI 2012, pp. 2527-2530.
 *
 *   alpha(fc, Te) = 1 / (1 + tau/Te),  tau = 1 / (2*PI*fc)
 *   dx_i    = (x_i - x_{i-1}) / Te                  (raw previous sample, per Algorithm 1)
 *   edx_i   = lowpass(dx_i, alpha(dCutoff, Te))
 *   fc_i    = minCutoff + beta * |edx_i|
 *   xhat_i  = lowpass(x_i, alpha(fc_i, Te))
 *
 * Tuning, in the paper's own order: set beta = 0 and lower minCutoff until slow-movement
 * jitter is acceptable, then raise beta until lag on fast movement is acceptable.
 */
export function createOneEuro(opts: { minCutoff?: number; beta?: number; dCutoff?: number } = {}): SmoothFn {
  const minCutoff = opts.minCutoff ?? 1
  const beta = opts.beta ?? 0.007
  const dCutoff = opts.dCutoff ?? 1

  const alpha = (cutoff: number, dt: number): number => 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt)

  let xRawPrev = 0
  let xHat = 0
  let dxHat = 0
  let primed = false

  return (x, dt) => {
    if (!primed) {
      primed = true
      xRawPrev = x
      xHat = x
      dxHat = 0
      return xHat
    }
    if (!(dt > 0)) return xHat

    const dx = (x - xRawPrev) / dt
    const aD = alpha(dCutoff, dt)
    dxHat = aD * dx + (1 - aD) * dxHat

    const aX = alpha(minCutoff + beta * Math.abs(dxHat), dt)
    xHat = aX * x + (1 - aX) * xHat
    xRawPrev = x
    return xHat
  }
}

// ─── sinks ───────────────────────────────────────────────────────────────────

export type DriverSink = (v: number) => void

/**
 * THREE-style uniform ref. Writing a uniform does NOT schedule a render: at tier 'low'
 * the canvas is frameloop 'demand' and the ticker owns invalidate(). A sink never does.
 */
export function uniformSink(ref: { value: number }): DriverSink {
  return (v) => {
    ref.value = v
  }
}

/**
 * CSS custom property. Values are written UNITLESS by default; the stylesheet applies
 * units via calc(var(--x) * 1px). Per house style, that keeps the unit next to the
 * design token instead of buried in a driver config.
 * Deduped on the formatted string: a redundant setProperty is a free style invalidation.
 */
export function cssVarSink(
  el: HTMLElement,
  name: `--${string}`,
  format: (v: number) => string = (v) => v.toFixed(4),
): DriverSink {
  let last: string | undefined
  return (v) => {
    const s = format(v)
    if (s === last) return
    last = s
    el.style.setProperty(name, s)
  }
}

export function callbackSink(fn: (v: number) => void): DriverSink {
  return fn
}

// ─── the driver ──────────────────────────────────────────────────────────────

export interface Remap {
  /** Input window normalized to 0..1 before shaping. Default [0, 1]. */
  in?: [number, number]
  /** Output window the shaped 0..1 expands into. Default [0, 1]. */
  out?: [number, number]
  /** Clamp the normalized value to 0..1. Default true. Set false for unbounded rotation. */
  clamp?: boolean
}

export interface DriverConfig {
  source: DriverSource
  remap?: Remap
  shape?: ShapeName | ShapeFn
  smooth?: Smoothing | SmoothFn
  sink: DriverSink
}

export interface Driver {
  start(): void
  stop(): void
}

/**
 * The reduced-motion nuance, and it is the whole judgement of this file:
 *
 * prefersReducedMotion() freezes AUTONOMOUS time only. A `time` driver never subscribes
 * to the ticker; it emits exactly one frozen sample at t=0 so the layer still renders its
 * static frame (the same idea as Paper's static-mesh-gradient) rather than sitting
 * uninitialized.
 *
 * `pointer`, `scroll` and `state` STILL RUN. They are direct manipulation, not autonomous
 * animation: an effect whose entire job is to respond to where you are loses the only
 * thing it does if you freeze it, and it responds only as fast as the user asked it to.
 * Freeze autonomous time; keep angle and pointer response.
 *
 * Amplitude reduction for scroll is the recipe's job via `remap.out`, not this file's.
 * A layer that should vanish entirely under reduced motion is tier 'off' (poster only),
 * decided upstream, so no driver is created at all.
 */
export function createDriver(config: DriverConfig): Driver {
  const { source, sink } = config
  const rIn = config.remap?.in ?? [0, 1]
  const rOut = config.remap?.out ?? [0, 1]
  const doClamp = config.remap?.clamp ?? true

  const shape: ShapeFn = typeof config.shape === 'function' ? config.shape : shapes[config.shape ?? 'linear']

  const smooth: SmoothFn | null =
    typeof config.smooth === 'function'
      ? config.smooth
      : config.smooth?.type === 'expDecay'
        ? createExpDecay(config.smooth.lambda)
        : config.smooth?.type === 'oneEuro'
          ? createOneEuro(config.smooth)
          : null

  let unsubscribe: (() => void) | null = null
  let usesPointer = false
  let prevX = pointer.x
  let prevY = pointer.y

  // normalize: source -> raw scalar in the source's own units.
  const normalize = (elapsed: number, dt: number): number => {
    switch (source.type) {
      case 'time':
        return elapsed * (source.speed ?? 1)
      case 'pointer': {
        const { x, y } = pointer
        const vx = dt > 0 ? (x - prevX) / dt : 0
        const vy = dt > 0 ? (y - prevY) / dt : 0
        prevX = x
        prevY = y
        return source.axis === 'x' ? x : source.axis === 'y' ? y : source.axis === 'vx' ? vx : vy
      }
      case 'scroll':
        return scrollProgress(source.element, source.range ?? 'cover')
      case 'state':
        return source.read()
    }
  }

  // remap straddles shape on purpose: the input half normalizes to 0..1 so easings always
  // see the unit interval they are defined on, the output half expands after. One config,
  // two positions. This is the only non-sequential step in the pipeline.
  const step = (elapsed: number, dt: number): void => {
    let t = map(normalize(elapsed, dt), rIn[0], rIn[1], 0, 1)
    if (doClamp) t = clamp01(t)
    let v = map(shape(t), 0, 1, rOut[0], rOut[1])
    if (smooth) v = smooth(v, dt)
    sink(v)
  }

  return {
    start(): void {
      if (unsubscribe) return
      if (typeof window === 'undefined') return // SSR: drivers exist, they just never run

      if (source.type === 'time' && prefersReducedMotion()) {
        step(0, 0)
        return
      }

      if (source.type === 'pointer') {
        usesPointer = true
        acquirePointer()
        prevX = pointer.x
        prevY = pointer.y
      }

      unsubscribe = subscribe((dt, elapsed) => step(elapsed, dt))
    },

    stop(): void {
      unsubscribe?.()
      unsubscribe = null
      if (usesPointer) {
        usesPointer = false
        releasePointer()
      }
    },
  }
}
