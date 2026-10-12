// Small numeric kit for the world: value noise for the procedural geometry, keyframe tracks for
// the camera journey, and the damper that keeps the camera from ever stepping.

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Smoothstep that also accepts a > b (a falling edge). */
export const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hash(ix: number, iy: number, iz: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(iz, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Trilinear value noise, 0..1. */
export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fy = y - iy;
  let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const x00 = mix(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx);
  const x10 = mix(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx);
  const x01 = mix(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx);
  const x11 = mix(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx);
  return mix(mix(x00, x10, fy), mix(x01, x11, fy), fz);
}

/** Fractal value noise, 0..1. */
export function fbm3(x: number, y: number, z: number, octaves = 4): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x, y, z);
    norm += amp;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.2;
    z = z * 2.03 + 4.7;
    amp *= 0.5;
  }
  return sum / norm;
}

export const fbm2 = (x: number, z: number, octaves = 4) => fbm3(x, 0.37, z, octaves);

// ── Keyframe tracks ──────────────────────────────────────────────────────────
// A key is [time, ...values]. "spline" is a Hermite curve whose tangents are the average of the
// neighbouring slopes, so velocity is continuous through every key however unevenly they are
// spaced. "smooth" eases between keys and holds still on equal neighbours (no overshoot).

export type Key = readonly number[];
export type Mode = "spline" | "smooth" | "linear";

export function sample(keys: readonly Key[], t: number, mode: Mode, out: number[]): number[] {
  const n = keys.length;
  const dim = keys[0].length - 1;
  if (t <= keys[0][0] || n === 1) {
    for (let d = 0; d < dim; d++) out[d] = keys[0][d + 1];
    return out;
  }
  if (t >= keys[n - 1][0]) {
    for (let d = 0; d < dim; d++) out[d] = keys[n - 1][d + 1];
    return out;
  }
  let i = 0;
  while (keys[i + 1][0] <= t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const span = k1[0] - k0[0];
  const s = (t - k0[0]) / span;
  if (mode !== "spline") {
    const e = mode === "smooth" ? s * s * (3 - 2 * s) : s;
    for (let d = 1; d <= dim; d++) out[d - 1] = k0[d] + (k1[d] - k0[d]) * e;
    return out;
  }
  const kp = keys[i - 1];
  const kn = keys[i + 2];
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  for (let d = 1; d <= dim; d++) {
    const slope = (k1[d] - k0[d]) / span;
    const m0 = kp ? 0.5 * (slope + (k0[d] - kp[d]) / (k0[0] - kp[0])) : slope;
    const m1 = kn ? 0.5 * (slope + (kn[d] - k1[d]) / (kn[0] - k1[0])) : slope;
    out[d - 1] = h00 * k0[d] + h10 * span * m0 + h01 * k1[d] + h11 * span * m1;
  }
  return out;
}

/** Critically damped follower: no overshoot, and it starts and stops without a velocity step. */
export function smoothDamp(
  state: { x: number; v: number },
  target: number,
  smoothTime: number,
  dt: number,
): number {
  const omega = 2 / smoothTime;
  const k = omega * dt;
  const decay = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const change = state.x - target;
  const temp = (state.v + omega * change) * dt;
  state.v = (state.v - omega * temp) * decay;
  state.x = target + (change + temp) * decay;
  return state.x;
}
