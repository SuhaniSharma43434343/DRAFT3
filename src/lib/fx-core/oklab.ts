/**
 * Oklab colour mixing.
 *
 * Why this module exists: Paper Shaders mixes colour in RGB (`uniform vec4 u_colors[]`), which
 * yields muddy, desaturated midpoints on complementary hues. Any vbt-fx-* layer that interpolates
 * colour either pre-mixes through `mixOklab` / `rampOklab` here, or injects `oklabGlsl` and mixes
 * shader-side. Wrapping Paper with Oklab pre-mixing is obligation 3 of the PaperSafe wrapper.
 *
 * Provenance: Bjorn Ottosson, "A perceptual color space for image processing",
 * https://bottosson.github.io/posts/oklab/ , which states verbatim: "The code is available in
 * public domain... It is also available under an MIT licensee". Public domain, therefore
 * unrestricted, cited here regardless. The M1/M2 matrices and the cube-root nonlinearity are his,
 * transcribed unchanged. IP firewall: GREEN. The sRGB transfer function is the standard piecewise
 * curve of IEC 61966-2-1.
 *
 * Judgement calls the contract does not settle, recorded once, here:
 *  1. `Rgb` is 0..1, not 0..255, so a triplet drops straight into a GLSL `vec3` and into Paper's
 *     `u_colors` with no rescale step for a caller to forget.
 *  2. Out-of-gamut results clamp per channel. Linear interpolation in Oklab between two in-gamut
 *     stops can leave the sRGB gamut slightly, because the gamut is not convex in Oklab. Real
 *     chroma-preserving gamut mapping needs culori; this module is zero-dep by contract, and the
 *     excursion between two in-gamut stops is small.
 *  3. Alpha hex (#rgba / #rrggbbaa) throws instead of silently dropping alpha. Paper's `u_colors`
 *     is a vec4, so a silent drop would surface as a wrongly opaque layer rather than an error.
 *
 * Zero dependencies. Pure functions. No global side effects on import. SSR-safe.
 */

/** sRGB, gamma-encoded, per channel 0..1. */
export type Rgb = readonly [number, number, number]

/** Oklab: L 0..1, a and b roughly -0.4..0.4. */
export type Oklab = readonly [number, number, number]

/** A hex string (`#rgb` or `#rrggbb`) or an `Rgb` triplet. */
export type Color = string | Rgb

/** NaN maps to 0 here as a last resort; inputs are validated at the boundary so it never fires. */
const clamp01 = (x: number): number => (x > 0 ? (x < 1 ? x : 1) : 0)

const at = <T>(xs: readonly T[], i: number): T => {
  const v = xs[i]
  if (v === undefined) throw new RangeError(`oklab: index ${i} is out of range (length ${xs.length}).`)
  return v
}

/** sRGB channel to linear-light. Negative inputs stay on the linear segment, so never NaN. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Linear-light channel to sRGB. Negative inputs stay on the linear segment, so never NaN. */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

/** Linear-light sRGB triplet to Oklab. Ottosson M1, cube root, M2. */
export function linearSrgbToOklab(rgb: Rgb): Oklab {
  const r = at(rgb, 0)
  const g = at(rgb, 1)
  const b = at(rgb, 2)

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** Oklab to linear-light sRGB. Unclamped: this is the raw inverse, callers clamp at the sRGB edge. */
export function oklabToLinearSrgb(lab: Oklab): Rgb {
  const bigL = at(lab, 0)
  const aa = at(lab, 1)
  const bb = at(lab, 2)

  const lp = bigL + 0.3963377774 * aa + 0.2158037573 * bb
  const mp = bigL - 0.1055613458 * aa - 0.0638541728 * bb
  const sp = bigL - 0.0894841775 * aa - 1.291485548 * bb

  const l = lp * lp * lp
  const m = mp * mp * mp
  const s = sp * sp * sp

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const HEX_RE = /^([0-9a-f]{3}|[0-9a-f]{6})$/i

/** `#rgb` or `#rrggbb`, with or without the hash, to an sRGB 0..1 triplet. */
export function hexToRgb(hex: string): Rgb {
  const h = hex.trim().replace(/^#/, '')

  if (h.length === 4 || h.length === 8) {
    throw new TypeError(
      `oklab: alpha hex is not supported ("${hex}"). Mix the rgb triplet and carry alpha separately.`,
    )
  }
  if (!HEX_RE.test(h)) {
    throw new TypeError(`oklab: expected #rgb or #rrggbb, received "${hex}".`)
  }

  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  const n = Number.parseInt(full, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** sRGB 0..1 triplet to `#rrggbb`. Clamps. */
export function rgbToHex(rgb: Rgb): string {
  const channel = (c: number): string =>
    Math.round(clamp01(c) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(at(rgb, 0))}${channel(at(rgb, 1))}${channel(at(rgb, 2))}`
}

/** Normalise either accepted form to a validated, clamped sRGB triplet. */
export function toRgb(c: Color): Rgb {
  if (typeof c === 'string') return hexToRgb(c)

  if (!Array.isArray(c) || c.length !== 3) {
    throw new TypeError(`oklab: expected an rgb triplet of length 3, received ${JSON.stringify(c)}.`)
  }
  const r = at(c, 0)
  const g = at(c, 1)
  const b = at(c, 2)
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    throw new TypeError(`oklab: rgb triplet must be three finite numbers, received ${JSON.stringify(c)}.`)
  }
  return [clamp01(r), clamp01(g), clamp01(b)]
}

/**
 * OKLCH (polar Oklab) to sRGB hex. `l` in [0,1], `c` chroma (sRGB holds up to ~0.37
 * at best; useful values sit below ~0.2), `h` hue in DEGREES.
 *
 * Polar to Cartesian is the textbook identity: a = C*cos(h), b = C*sin(h). Out-of-gamut
 * results clamp per channel rather than gamut-map, matching this module's judgement
 * elsewhere: real chroma-preserving mapping needs culori, and this module is zero-dep
 * by contract. Callers wanting guaranteed in-gamut colours keep chroma modest.
 */
export function oklchToHex(l: number, c: number, h: number): string {
  const hr = (h * Math.PI) / 180
  const lin = oklabToLinearSrgb([l, c * Math.cos(hr), c * Math.sin(hr)])
  return rgbToHex([
    clamp01(linearToSrgb(at(lin, 0))),
    clamp01(linearToSrgb(at(lin, 1))),
    clamp01(linearToSrgb(at(lin, 2))),
  ])
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const la = linearSrgbToOklab([srgbToLinear(at(a, 0)), srgbToLinear(at(a, 1)), srgbToLinear(at(a, 2))])
  const lb = linearSrgbToOklab([srgbToLinear(at(b, 0)), srgbToLinear(at(b, 1)), srgbToLinear(at(b, 2))])

  const k = clamp01(t)
  const lin = oklabToLinearSrgb([
    at(la, 0) + (at(lb, 0) - at(la, 0)) * k,
    at(la, 1) + (at(lb, 1) - at(la, 1)) * k,
    at(la, 2) + (at(lb, 2) - at(la, 2)) * k,
  ])

  return [
    clamp01(linearToSrgb(at(lin, 0))),
    clamp01(linearToSrgb(at(lin, 1))),
    clamp01(linearToSrgb(at(lin, 2))),
  ]
}

/**
 * Perceptually even mix of two colours at `t` 0..1. Returns the same form it was given:
 * hex in, hex out; triplet in, triplet out. `t` is clamped, so this interpolates, never extrapolates.
 */
export function mixOklab(a: string, b: string, t: number): string
export function mixOklab(a: Rgb, b: Rgb, t: number): Rgb
export function mixOklab(a: Color, b: Color, t: number): Color {
  if (!Number.isFinite(t)) throw new TypeError(`oklab: mixOklab needs a finite t, received ${t}.`)
  const out = mixRgb(toRgb(a), toRgb(b), t)
  return typeof a === 'string' ? rgbToHex(out) : out
}

function sampleRamp(stops: readonly Rgb[], t: number): Rgb {
  const last = stops.length - 1
  if (last === 0) return at(stops, 0)

  const x = clamp01(t) * last
  const i = Math.min(Math.floor(x), last - 1)
  return mixRgb(at(stops, i), at(stops, i + 1), x - i)
}

/**
 * `n` samples evenly spaced across `stops`, mixed in Oklab, endpoints inclusive.
 * Input stops are treated as evenly distributed across 0..1. `n === 1` returns the first stop.
 * Returns the same form it was given: hex in, hex out; triplets in, triplets out.
 */
export function rampOklab(stops: readonly string[], n: number): string[]
export function rampOklab(stops: readonly Rgb[], n: number): Rgb[]
export function rampOklab(stops: readonly Color[], n: number): Color[] {
  if (!Number.isInteger(n) || n < 0) {
    throw new TypeError(`oklab: rampOklab needs a non-negative integer n, received ${n}.`)
  }
  if (stops.length === 0) {
    throw new TypeError('oklab: rampOklab needs at least one stop.')
  }

  const asHex = typeof at(stops, 0) === 'string'
  const rgbStops = stops.map(toRgb)

  const out: Color[] = []
  for (let i = 0; i < n; i += 1) {
    const sample = sampleRamp(rgbStops, n === 1 ? 0 : i / (n - 1))
    out.push(asHex ? rgbToHex(sample) : sample)
  }
  return out
}

/**
 * The same transform, shader-side, for layers that must mix per-fragment rather than pre-mix.
 * Inject once, above any function that calls it. The include guard keeps concatenation idempotent
 * when two layers both inject it into one program.
 *
 * Operates on LINEAR sRGB, matching `linearSrgbToOklab` above. Paper Shaders declares
 * `precision mediump float`; these coefficients are written at full precision and will truncate
 * there. Grain is the mitigation for the resulting banding, per law 4.
 */
export const oklabGlsl: string = `
#ifndef OKLAB_GLSL
#define OKLAB_GLSL
// Oklab. Bjorn Ottosson, public domain. https://bottosson.github.io/posts/oklab/
vec3 linearSrgbToOklab(vec3 c) {
  vec3 lms = mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376, 0.0514459929, 0.1073969566, 0.6299787005) * c;
  lms = pow(max(lms, 0.0), vec3(0.3333333333));
  return mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662, -0.0040720468, 0.4505937099, -0.8086757660) * lms;
}
vec3 oklabToLinearSrgb(vec3 c) {
  vec3 lms = mat3(1.0, 1.0, 1.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728, -1.2914855480) * c;
  lms = lms * lms * lms;
  return mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147, 0.2309699292, -0.3413193965, 1.7076147010) * lms;
}
vec3 mixOklab(vec3 a, vec3 b, float t) {
  return oklabToLinearSrgb(mix(linearSrgbToOklab(a), linearSrgbToOklab(b), t));
}
#endif
`
