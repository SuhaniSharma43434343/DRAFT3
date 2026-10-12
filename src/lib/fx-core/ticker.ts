/**
 * fx-core/ticker.ts
 *
 * THE single shared ticker. Law 2: one ticker, one driver layer, one motion
 * gate. Twelve skills each running their own requestAnimationFrame is twelve
 * motion bugs and twelve reduced-motion regressions.
 *
 * UNITS: dt and elapsed are SECONDS, never milliseconds. drivers.ts reads
 * lambda in units of 1/second for exp(-lambda * dt). Feeding it milliseconds
 * makes every smoothed value collapse to its target on frame one.
 *
 * This module gates nothing. prefers-reduced-motion lives in motion.ts; the
 * ticker stays dumb so there is exactly one place that decision is made.
 *
 * Zero dependencies. No window/document access at module scope: importing
 * this in a server component is inert, and subscribe() is a no-op under SSR.
 */

export type TickFn = (dt: number, elapsed: number) => void
export type Unsubscribe = () => void

/**
 * dt ceiling in seconds: one frame at 30fps.
 *
 * After a tab stall, a GC pause, or a slow route transition the next rAF
 * timestamp can land seconds past the previous one. Uncapped, that arrives as
 * a single integration step: exp(-lambda * dt) collapses to ~0 so every
 * smoothed value teleports to its target, and any elapsed-driven uniform jumps
 * a whole cycle. The hero visibly snaps on tab return.
 *
 * The exp form is already unconditionally stable under a dt spike (it cannot
 * overshoot the way v += (target - v) * k can), so this cap is not protecting
 * the math. It is protecting the look: past ~1/30s we would rather under-
 * advance (a few frames of slow motion) than teleport.
 */
const MAX_DT = 1 / 30

const subscribers = new Set<TickFn>()

/** Snapshot of `subscribers`, rebuilt only on change to keep the frame allocation-free. */
let order: TickFn[] = []
let orderDirty = false

let rafId: number | null = null
let lastTimestamp: number | null = null
let elapsed = 0
let manuallyStopped = false
let listening = false

/** Functions that have already thrown, so a 120Hz loop cannot spam the console. */
const reported = new WeakSet<TickFn>()

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

function shouldRun(): boolean {
  return (
    !manuallyStopped &&
    subscribers.size > 0 &&
    !isHidden() &&
    typeof requestAnimationFrame === 'function'
  )
}

function onVisibilityChange(): void {
  // Drop the stale base so the first frame after resume reports the real
  // inter-frame gap and not the length of the stall.
  lastTimestamp = null
  sync()
}

function ensureListener(): void {
  if (listening || typeof document === 'undefined') return
  listening = true
  // Never removed. While hidden there is no rAF to wake us, so this listener is
  // the only path back to running. One document listener per page is that cost.
  document.addEventListener('visibilitychange', onVisibilityChange)
}

/** Reconciles the rAF against desired state. Every mutation routes through here, so a leak needs a new code path. */
function sync(): void {
  const want = shouldRun()

  if (want && rafId === null) {
    ensureListener()
    lastTimestamp = null
    rafId = requestAnimationFrame(frame)
    return
  }

  if (!want && rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
    lastTimestamp = null
  }
}

function frame(timestamp: number): void {
  rafId = null

  // Reschedule before dispatch, not after: a subscriber that throws, or one
  // that calls stop(), must resolve through sync() rather than by silently
  // stranding the loop for every other layer.
  if (shouldRun()) rafId = requestAnimationFrame(frame)

  let dt = 0
  if (lastTimestamp !== null) {
    // Clamped low as well as high. Some engines hand back a timestamp behind
    // the previous one; a negative dt flips exp(-lambda * dt) above 1 and
    // amplifies instead of damping, which is the exact divergence the exp form
    // exists to rule out.
    dt = Math.min(Math.max((timestamp - lastTimestamp) / 1000, 0), MAX_DT)
  }
  lastTimestamp = timestamp

  // elapsed is the integral of the CLAMPED dt, not wall clock. If it tracked
  // wall clock, clamping dt would buy nothing for elapsed-driven uniforms and
  // the two arguments would disagree after any stall.
  elapsed += dt

  if (orderDirty) {
    order = Array.from(subscribers)
    orderDirty = false
  }

  for (const fn of order) {
    // The snapshot outlives an unsubscribe that happened earlier in this same
    // frame. Skipping the removed entry is what stops a torn-down layer being
    // ticked after its cleanup ran.
    if (!subscribers.has(fn)) continue
    try {
      fn(dt, elapsed)
    } catch (error) {
      if (!reported.has(fn)) {
        reported.add(fn)
        console.error('[fx-core/ticker] subscriber threw, remaining layers continue', error)
      }
    }
  }
}

/**
 * Subscribe to the shared loop. Starts it if this is the first subscriber.
 *
 * The returned unsubscribe is idempotent and stops the loop when it removes
 * the last subscriber, so a React effect cleanup (including StrictMode's
 * double invoke) cannot leak a rAF.
 *
 * Under SSR this returns an inert unsubscribe, so callers need no
 * typeof-window branch of their own.
 */
export function subscribe(fn: TickFn): Unsubscribe {
  if (typeof window === 'undefined') return () => {}

  subscribers.add(fn)
  orderDirty = true
  // Attach the wake listener HERE, not only in sync()'s start branch. If the first
  // subscription happens while the tab is hidden (background-tab open), shouldRun()
  // is false, the start branch never runs, and without this line nothing would ever
  // be listening for the visibilitychange that is the only path back to running.
  ensureListener()
  sync()

  let released = false
  return () => {
    if (released) return
    released = true
    subscribers.delete(fn)
    orderDirty = true
    sync()
  }
}

/**
 * Clear a manual stop and resume if there are subscribers. Test hook, and the
 * escape hatch for a host that drives its own loop.
 */
export function start(): void {
  manuallyStopped = false
  sync()
}

/**
 * Halt the loop and latch it off. subscribe() will NOT auto-start again until
 * start() is called: that latch is the whole point of a manual stop.
 */
export function stop(): void {
  manuallyStopped = true
  sync()
}

/** Whether a rAF is currently scheduled. Exists so "no leaked rAF" is assertable from a test. */
export function isRunning(): boolean {
  return rafId !== null
}
