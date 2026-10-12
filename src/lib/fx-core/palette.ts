/**
 * Seeded palette. One seed drives the avatar row, the backdrop tint and any
 * chart palette, so a whole hero is colour coherent for free. Pure and
 * deterministic: the same seed always yields the same palette, on server and
 * client alike.
 */

// Hex is the one format every consumer takes: CSS custom properties, three.Color,
// and Paper's u_colors[]. An `oklch()` CSS string would not parse in WebGL.
// oklchToHex takes l in [0,1], c chroma, h in DEGREES, and clamps out-of-gamut
// results per channel (it does not gamut-map), so keep chroma modest.
import { oklchToHex } from './oklab'

export type Harmony = 'analogous' | 'complementary' | 'triadic'

export interface Palette {
  colors: string[]
  harmony: Harmony
}

/** Hue offsets in degrees defining each harmony. Cycled across the ramp. */
const HARMONY_RING: Record<Harmony, readonly number[]> = {
  analogous: [0, 30, -30],
  complementary: [0, 180],
  triadic: [0, 120, 240],
}

const HARMONIES: readonly Harmony[] = ['analogous', 'complementary', 'triadic']

const COUNT = 5
const L_LO = 0.42
const L_HI = 0.86

/** FNV-1a, 32 bit. Hashes UTF-16 code units, so any seed string is stable.
 * Exported (with mulberry32) as fx-core's determinism primitives: one seed
 * pipeline for palette, identicon geometry, and anything else that must be
 * byte-identical on server and client. Do not reimplement these per skill. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32. Yields [0, 1), never exactly 1, so floor() indexing is in range. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generatePalette(seed: string): Palette {
  const rng = mulberry32(fnv1a(seed))
  const harmony = HARMONIES[Math.floor(rng() * HARMONIES.length)]!
  const ring = HARMONY_RING[harmony]
  const baseHue = rng() * 360
  const baseChroma = 0.08 + rng() * 0.08

  const colors: string[] = []
  for (let i = 0; i < COUNT; i++) {
    // Even steps in OKLCH L are even perceptual steps. That is the whole reason
    // this ramp is built in OKLCH and not HSL.
    const l = L_LO + ((L_HI - L_LO) * i) / (COUNT - 1)
    // Chroma tapers toward both lightness extremes, where sRGB holds less of it.
    const c = baseChroma * Math.sin(Math.PI * l)
    const jitter = (rng() - 0.5) * 16
    const h = (((baseHue + ring[i % ring.length]! + jitter) % 360) + 360) % 360
    colors.push(oklchToHex(l, c, h))
  }

  return { colors, harmony }
}
