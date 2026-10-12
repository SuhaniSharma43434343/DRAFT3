/**
 * fx-core/motion.ts
 *
 * THE reduced-motion and capability gate. Law 2: one ticker, one driver layer, one motion
 * gate. Every vbt-fx-* component self-gates through resolveTier() here. A skill that reads
 * matchMedia directly has forked the gate and will drift from the other eleven.
 *
 * SSR contract: every probe answers false on the server, so resolveTier() returns 'off' for
 * any canvas layer during SSR. The server therefore renders the poster, which is what law 3
 * requires (the LCP element is text or the poster, never the canvas). The real tier resolves
 * after hydration.
 */

// No 'use client' directive. index.ts re-exports this module, and the directive would turn
// every barrel consumer (types, oklab, palette) into a client reference and make resolveTier
// uncallable from a Server Component. Hook callers carry their own directive.

import { useSyncExternalStore } from 'react'
import type { Tier } from './types'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const COARSE_POINTER_QUERY = '(pointer: coarse)'

/** Device Memory reports approximate GiB, quantised to 0.25/0.5/1/2/4/8. Below 4 is poster territory. */
const MIN_DEVICE_MEMORY_GB = 4

const noop = (): void => {}

/* ------------------------------------------------------------------ media queries */

const mqlCache = new Map<string, MediaQueryList | null>()

function getMql(query: string): MediaQueryList | null {
  // Deliberately not cached on the miss: the server's answer must never survive into the client.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null

  const cached = mqlCache.get(query)
  if (cached !== undefined) return cached

  let mql: MediaQueryList | null = null
  try {
    mql = window.matchMedia(query)
  } catch {
    mql = null
  }
  mqlCache.set(query, mql)
  return mql
}

/** Reads live off the MediaQueryList. Never a snapshot frozen at import. */
function queryMatches(query: string): boolean {
  return getMql(query)?.matches ?? false
}

interface LegacyMediaQueryList {
  addListener?(listener: (event: MediaQueryListEvent) => void): void
  removeListener?(listener: (event: MediaQueryListEvent) => void): void
}

function subscribeQuery(query: string, onChange: () => void): () => void {
  const mql = getMql(query)
  if (mql === null) return noop

  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange)
    return () => {
      mql.removeEventListener('change', onChange)
    }
  }

  // Safari below 14 predates addEventListener on MediaQueryList.
  const legacy = mql as unknown as LegacyMediaQueryList
  legacy.addListener?.(onChange)
  return () => {
    legacy.removeListener?.(onChange)
  }
}

/* ------------------------------------------------------------------ probes */

/**
 * Live. Re-reads the media query on every call, so a mid-session OS toggle is honoured
 * without a reload. Returns false on the server.
 */
export function prefersReducedMotion(): boolean {
  return queryMatches(REDUCED_MOTION_QUERY)
}

/** Touch and pen. Per the layer contract, a pointer-driven effect goes off, not degraded. */
export function isCoarsePointer(): boolean {
  return queryMatches(COARSE_POINTER_QUERY)
}

function subscribeReducedMotion(onChange: () => void): () => void {
  return subscribeQuery(REDUCED_MOTION_QUERY, onChange)
}

function reducedMotionServerSnapshot(): boolean {
  return false
}

/**
 * React binding for prefersReducedMotion(). useSyncExternalStore keeps the server snapshot
 * and the hydration snapshot aligned, so this cannot produce a hydration mismatch.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, reducedMotionServerSnapshot)
}

let webgl2Support: boolean | null = null

/**
 * Feature-detects WebGL2 without throwing and without keeping the probe context alive.
 * This is the check that stands between a browser with no WebGL2 and Paper Shaders'
 * unguarded `throw new Error('Paper Shaders: WebGL is not supported in this browser')`.
 */
export function hasWebGL2(): boolean {
  if (webgl2Support !== null) return webgl2Support
  // Not cached: a false forced by the absent document would poison the client.
  if (typeof document === 'undefined') return false

  let gl: WebGL2RenderingContext | null = null
  let supported = false
  try {
    gl = document.createElement('canvas').getContext('webgl2')
    // A blocklisted GPU can hand back a context that is already lost.
    supported = gl !== null && !gl.isContextLost()
  } catch {
    supported = false
  } finally {
    // Browsers cap live contexts (~16) and silently evict the oldest. The probe must not spend one.
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  }

  webgl2Support = supported
  return supported
}

type NavigatorCapabilities = {
  readonly connection?: { readonly saveData?: boolean }
  readonly deviceMemory?: number
}

function navigatorCapabilities(): NavigatorCapabilities | null {
  if (typeof navigator === 'undefined') return null
  // Structural cast rather than a global `declare` augmentation: neither API is in lib.dom,
  // and augmenting Navigator here would leak types into every consuming project.
  return navigator as unknown as NavigatorCapabilities
}

/** Data Saver. User-toggleable mid-session, so this is never cached. */
export function saveData(): boolean {
  return navigatorCapabilities()?.connection?.saveData === true
}

export function deviceMemoryLow(): boolean {
  const gb = navigatorCapabilities()?.deviceMemory
  // Absent (Safari, Firefox) is not the same as low. Treating unknown as low would poster
  // every iPhone in the world.
  return typeof gb === 'number' && gb < MIN_DEVICE_MEMORY_GB
}

/* ------------------------------------------------------------------ the mount ladder */

export interface TierGateOptions {
  /** Effect is pointer-driven. Coarse pointer then resolves to 'off', never to a degraded tier. */
  needsPointer?: boolean
  /**
   * Effect renders through the shared <FxCanvas>. Defaults true, because 'no WebGL' is an
   * unconditional off trigger in the contract. DOM-only layers (type, wordmark, avatars)
   * pass false so a missing GPU does not silently kill their entrance.
   */
  needsWebGL?: boolean
  /**
   * What prefers-reduced-motion does to THIS layer.
   *
   * 'off' (default): the ladder's unconditional trigger - poster only. Correct for any
   * layer with no static render of its own.
   *
   * 'survive': the layer OWNS a reduced-motion render (manifest fallback.reduced_motion
   * 'static': Paper's Static* variants, a snap-follow glow, a frozen field) and handles
   * the swap itself via useReducedMotion(). resolveTier then skips the RM probe so the
   * richer render is reachable. Phase-1 exposed the gap: with RM folded in
   * unconditionally, every declared 'static' fallback was DEAD CODE and reduced-motion
   * users got the poster instead of the static render the manifest promised - six of
   * thirteen review findings were this one collapse.
   */
  reducedMotion?: 'off' | 'survive'
}

/**
 * The one mount ladder. Returns `requested` or 'off'. It never upgrades, and it never
 * degrades 'high' to 'low': that regression is PerformanceMonitor's call at runtime, on
 * observed frame drops, not a decision available at mount.
 */
export function resolveTier(requested: Tier, opts: TierGateOptions = {}): Tier {
  if (requested === 'off') return 'off'

  // Cheapest probes first. A machine that trips any of these never pays for a GL context.
  if (opts.reducedMotion !== 'survive' && prefersReducedMotion()) return 'off'
  if (saveData()) return 'off'
  if (deviceMemoryLow()) return 'off'
  if (opts.needsPointer === true && isCoarsePointer()) return 'off'
  if (opts.needsWebGL !== false && !hasWebGL2()) return 'off'

  return requested
}
