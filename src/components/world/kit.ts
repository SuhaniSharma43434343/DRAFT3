// Building blocks for the procedural world: the shared atmosphere, the rock/earth material, lofted
// surfaces (rock formations, stockpiles, the hull) and a kit-basher that merges coloured primitives
// into one draw call per structure.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { NOISE } from "./glsl";
import { fbm3, noise3 } from "./math";

export type Quality = {
  /** Phone or coarse pointer: lighter geometry, no shadows, no bump detail. */
  small: boolean;
};

// Natural material colours. Gold is the one accent; nothing else is saturated.
export const PALETTE = {
  haze: "#ece5d6",
  zenith: "#a7b9c6",
  sun: "#ffe4ba",
  limestone: "#dccfb5",
  sandstone: "#c9ad85",
  strata: "#9c8262",
  sand: "#e2d5ba",
  concrete: "#bdb7aa",
  concreteDark: "#989284",
  steel: "#8b949a",
  steelDark: "#5b6368",
  charcoal: "#454a4d",
  ivory: "#f4efe6",
  gold: "#c9a962",
  oxide: "#7d4636",
  sea: "#2b4350",
  seaLit: "#557d82",
} as const;

/** Uniforms every custom shader shares, so the whole world sits in one light and one haze. */
export const air = {
  uHorizon: { value: new THREE.Color(PALETTE.haze) },
  uZenith: { value: new THREE.Color(PALETTE.zenith) },
  uSunDir: { value: new THREE.Vector3(0.56, 0.7, -0.5).normalize() },
  uSunCol: { value: new THREE.Color(PALETTE.sun) },
  uFogDensity: { value: 0.001 },
  uTime: { value: 0 },
};

// ── Earth material ───────────────────────────────────────────────────────────
// MeshStandardMaterial (so it takes the sun, shadows and haze) with the surface painted in the
// shader from world position: sedimentary beds, grain, and wind-laid sand on anything level.

export type EarthOptions = {
  a: THREE.ColorRepresentation; // light bed
  b: THREE.ColorRepresentation; // dark bed
  seam?: THREE.ColorRepresentation; // thin bedding lines
  sand?: THREE.ColorRepresentation; // colour that settles on level ground
  strata?: number; // 0 = uniform material, 1 = fully bedded rock
  sandAmount?: number;
  grain?: number; // noise frequency, per metre
  bump?: number; // relief height, metres
  roughness?: number;
  metalness?: number;
  flatShading?: boolean;
};

export function earthMaterial(q: Quality, o: EarthOptions): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: o.roughness ?? 0.94,
    metalness: o.metalness ?? 0,
    flatShading: o.flatShading ?? false,
  });
  const uniforms = {
    uA: { value: new THREE.Color(o.a) },
    uB: { value: new THREE.Color(o.b) },
    uSeam: { value: new THREE.Color(o.seam ?? o.b) },
    uSand: { value: new THREE.Color(o.sand ?? o.a) },
    uP: { value: new THREE.Vector4(o.strata ?? 0, o.bump ?? 0.5, o.grain ?? 0.5, o.sandAmount ?? 0) },
  };
  mat.defines = { FBM_OCTAVES: q.small ? 3 : 4, ...(q.small ? {} : { EARTH_BUMP: "" }) };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;")
      .replace(
        "#include <fog_vertex>",
        /* glsl */ `#include <fog_vertex>
        vec4 wp_ = vec4(transformed, 1.0);
        vec3 wn_ = objectNormal;
        #ifdef USE_INSTANCING
          wp_ = instanceMatrix * wp_;
          wn_ = mat3(instanceMatrix) * wn_;
        #endif
        vWPos = (modelMatrix * wp_).xyz;
        vWNrm = mat3(modelMatrix) * wn_;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
        ${NOISE}
        varying vec3 vWPos;
        varying vec3 vWNrm;
        uniform vec3 uA;
        uniform vec3 uB;
        uniform vec3 uSeam;
        uniform vec3 uSand;
        uniform vec4 uP; // strata, bump height, grain frequency, sand amount
        float reliefH(vec3 q) { return vnoise(q) * 0.62 + vnoise(q * 2.7 + 5.3) * 0.38; }`,
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        {
          float warp = fbm(vWPos * 0.011);
          // Beds are a noise of height, tilted a little and warped so no two walls match.
          float yb = vWPos.y * 0.15 + warp * 7.0 + dot(vWPos.xz, vec2(0.012, 0.007));
          float bed = vnoise(vec3(yb * 0.9, 3.7, 1.3)) * 0.65 + vnoise(vec3(yb * 2.9, 9.1, 4.2)) * 0.35;
          vec3 rock = mix(uA, uB, smoothstep(0.32, 0.7, bed));
          float seam = smoothstep(0.84, 1.0, sin(yb * 6.0 + warp * 5.0) * 0.5 + 0.5);
          rock = mix(rock, uSeam, seam * 0.55);
          vec3 plain = mix(uA, uB, smoothstep(0.25, 0.75, warp));
          vec3 base = mix(plain, rock, uP.x);
          base *= 0.8 + 0.4 * fbm(vWPos * uP.z);
          float level = smoothstep(0.6, 0.93, normalize(vWNrm).y);
          base = mix(base, uSand * (0.9 + 0.2 * warp), level * uP.w);
          diffuseColor.rgb *= base;
        }`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
        #ifdef EARTH_BUMP
        {
          // Relief from the same noise, by forward differences. It fades out once a pixel spans
          // more than a noise cell, so distant rock never sparkles.
          vec3 q = vWPos * uP.z * 1.7;
          vec3 dqx = dFdx(q);
          vec3 dqy = dFdy(q);
          float keep = smoothstep(1.1, 0.25, max(length(dqx), length(dqy)));
          if (keep > 0.0) {
            float h0 = reliefH(q);
            vec2 dH = vec2(reliefH(q + dqx) - h0, reliefH(q + dqy) - h0) * uP.y * keep;
            vec3 sx = dFdx(-vViewPosition);
            vec3 sy = dFdy(-vViewPosition);
            vec3 r1 = cross(sy, normal);
            vec3 r2 = cross(normal, sx);
            float det = dot(sx, r1) * faceDirection;
            normal = normalize(abs(det) * normal - sign(det) * (dH.x * r1 + dH.y * r2));
          }
        }
        #endif`,
      );
  };
  return mat;
}

// ── Lofted surfaces ──────────────────────────────────────────────────────────

export type LoftFn = (u: number, v: number, out: THREE.Vector3) => void;
export type LoftColor = (u: number, v: number, p: THREE.Vector3, out: THREE.Color) => void;

/**
 * A grid of rows x cols quads swept by `fn(u, v)`. `closed` wraps v (a column, a hull section).
 * `solid` orients the faces outward by signed volume, so callers need not think about winding.
 */
export function loft(
  rows: number,
  cols: number,
  closed: boolean,
  fn: LoftFn,
  opts: { color?: LoftColor; solid?: boolean; flip?: boolean } = {},
): THREE.BufferGeometry {
  const cn = closed ? cols : cols + 1;
  const pos = new Float32Array((rows + 1) * cn * 3);
  const col = opts.color ? new Float32Array(pos.length) : null;
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j < cn; j++) {
      fn(i / rows, j / cols, p);
      p.toArray(pos, (i * cn + j) * 3);
      if (col) {
        opts.color!(i / rows, j / cols, p, c);
        c.toArray(col, (i * cn + j) * 3);
      }
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * cn + j;
      const b = i * cn + ((j + 1) % cn);
      const d = (i + 1) * cn + j;
      const e = (i + 1) * cn + ((j + 1) % cn);
      idx.push(a, d, b, b, d, e);
    }
  }
  let flip = opts.flip ?? false;
  if (opts.solid) {
    let vol = 0;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3;
      const b = idx[i + 1] * 3;
      const d = idx[i + 2] * 3;
      vol +=
        pos[a] * (pos[b + 1] * pos[d + 2] - pos[b + 2] * pos[d + 1]) +
        pos[a + 1] * (pos[b + 2] * pos[d] - pos[b] * pos[d + 2]) +
        pos[a + 2] * (pos[b] * pos[d + 1] - pos[b + 1] * pos[d]);
    }
    flip = vol < 0;
  }
  if (flip) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (col) geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export type ColumnOptions = {
  rx: number;
  rz: number;
  h: number;
  seed: number;
  /** Superellipse exponent of the plan: 2 is round, 4 and up is a slab. */
  sharp?: number;
  /** How far the top leans, in metres. */
  lean?: [number, number];
  /** Thickness of the sedimentary ledges, metres. */
  ledge?: number;
  rows?: number;
  cols?: number;
};

/** A rock formation: a tower, mesa, fin or boulder, depending on its proportions. */
export function rockColumn(o: ColumnOptions): THREE.BufferGeometry {
  const power = o.sharp ?? 3;
  const ledge = o.ledge ?? 11;
  const sink = Math.min(12, o.h * 0.2);
  const f = 2.1 / Math.max(o.rx, o.rz);
  const WALL = 0.84; // share of the rows spent on the wall; the rest round over into the top
  let scale = 1;
  return loft(
    o.rows ?? 34,
    o.cols ?? 44,
    true,
    (u, v, p) => {
      const a = v * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const se = Math.pow(Math.pow(Math.abs(c), power) + Math.pow(Math.abs(s), power), -1 / power);
      const wall = Math.min(1, u / WALL);
      const top = Math.max(0, (u - WALL) / (1 - WALL)); // 0 at the shoulder, 1 at the centre of the top
      const y = wall * (o.h + sink) - sink;
      const x0 = o.rx * se * c;
      const z0 = o.rz * se * s;
      const flare = 1 + 0.3 * Math.pow(1 - wall, 3);
      const lump = fbm3(x0 * f + o.seed, y * f * 0.6, z0 * f + o.seed * 0.37) - 0.5;
      const bedIndex = Math.floor(y / ledge + noise3(c * 1.5 + o.seed, 0.5, s * 1.5) * 0.9);
      const bed = noise3(bedIndex * 7.31, o.seed, 2.1) - 0.5;
      const flute = noise3(c * 4.2 + o.seed, y * 0.012, s * 4.2) - 0.5;
      // The shoulder is a quarter-round: radius closes in while the height eases flat.
      const shoulder = Math.cos(top * Math.PI * 0.5);
      scale = flare * (1 + lump * 0.62 + bed * 0.16 + flute * 0.17) * (0.86 + 0.14 * shoulder);
      const close = Math.pow(shoulder, 0.75);
      // Across the top the outline's lumps are eased out, or they would run to the centre as ridges.
      const plan = scale * close * (1 - top * 0.5) + close * top * 0.5;
      const px = x0 * plan;
      const pz = z0 * plan;
      const crown = Math.sin(top * Math.PI * 0.5) * Math.min(o.rx, o.rz) * 0.16;
      const rough = (fbm3(px * f * 2.4 + 3, o.seed, pz * f * 2.4) - 0.5) * Math.min(o.rx, o.rz) * 0.3 * top;
      p.set(px + (o.lean?.[0] ?? 0) * wall * wall, y + crown + rough, pz + (o.lean?.[1] ?? 0) * wall * wall);
    },
    {
      solid: true,
      // Baked occlusion: darker where the rock meets the ground and inside its recessed beds.
      color: (u, _v, _p, out) => {
        const ground = 0.6 + 0.4 * Math.min(1, ((u / WALL) * (o.h + sink)) / 26);
        const recess = Math.min(1.08, Math.max(0.72, 0.5 + scale * 0.48));
        out.setScalar(Math.min(1, ground * recess));
      },
    },
  );
}

/** A natural arch standing in the XY plane: a noisy tube along a half-ellipse, feet in the ground. */
export function rockArch(span: number, rise: number, thick: number, seed: number): THREE.BufferGeometry {
  const centre = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  let r = 1;
  return loft(
    46,
    22,
    true,
    (u, v, p) => {
      const t = Math.PI * (u * 1.16 - 0.08); // run the legs a little below ground
      centre.set(-Math.cos(t) * span * 0.5, Math.sin(t) * rise, 0);
      tan.set(Math.sin(t) * span * 0.5, Math.cos(t) * rise, 0).normalize();
      nrm.set(-tan.y, tan.x, 0);
      const a = v * Math.PI * 2;
      const legs = 1 + 0.9 * Math.pow(1 - Math.max(0, Math.sin(t)), 2.2);
      const lump = fbm3(centre.x * 0.05 + seed, centre.y * 0.05 + Math.cos(a) * 1.4, Math.sin(a) * 1.4) - 0.5;
      r = thick * legs * (1 + lump * 0.7);
      p.copy(centre)
        .addScaledVector(nrm, Math.cos(a) * r)
        .setZ(Math.sin(a) * r * 1.5);
    },
    {
      solid: true,
      color: (_u, v, p, out) => {
        const under = 0.78 + 0.22 * Math.max(0, -Math.cos(v * Math.PI * 2)); // the soffit sits in shade
        out.setScalar(Math.min(1, under * (0.62 + 0.38 * Math.min(1, Math.max(0, p.y) / 20))));
      },
    },
  );
}

export type Heap = {
  geometry: THREE.BufferGeometry;
  /** A point on the heap's surface: u 0 (crest) to 1 (toe), a = angle around. */
  surface: (u: number, a: number, out: THREE.Vector3) => THREE.Vector3;
};

/** A bulk stockpile at its angle of repose: a cone with a soft crest, a ragged toe and slumps. */
export function heap(r: number, h: number, seed: number, ridge = 0): Heap {
  const surface = (u: number, a: number, out: THREE.Vector3) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const lobes = 1 + (fbm3(c * 1.2 + seed, 0.3, s * 1.2 + seed) - 0.5) * 0.5 * u;
    const rad = r * Math.pow(u, 0.92) * lobes;
    const y = h * Math.pow(1 - u, 1.25) * (1 - 0.1 * (noise3(c * 3 + seed, u * 3, s * 3) - 0.5));
    // `ridge` stretches the cone into a windrow along x, the shape a stacker leaves.
    return out.set(c * rad + Math.sign(c) * ridge * (1 - u * 0.25) * Math.min(1, Math.abs(c) * 3), y - 0.4, s * rad);
  };
  const geometry = loft(18, 40, true, (u, v, p) => surface(u, v * Math.PI * 2, p), {
    solid: true,
    color: (u, _v, _p, out) => out.setScalar(0.74 + 0.26 * (1 - u * u)),
  });
  return { geometry, surface };
}

// ── Kit-bashing ──────────────────────────────────────────────────────────────

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

/** Collects coloured primitives and merges them into a single geometry with vertex colours. */
export class Kit {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, matrix?: THREE.Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (matrix) g.applyMatrix4(matrix);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute("uv");
    this.parts.push(g);
    return this;
  }

  /** A box centred on (x, y, z), optionally turned about y then tilted about x and z. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, ry = 0, rx = 0, rz = 0): this {
    M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, "YXZ")), ONE);
    return this.add(new THREE.BoxGeometry(w, h, d), color, M);
  }

  /** An upright cylinder (or cone frustum) centred on (x, y, z). */
  cyl(rTop: number, rBottom: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 14, rx = 0, rz = 0): this {
    M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, 0, rz)), ONE);
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg), color, M);
  }

  /** A straight member of square section between two points: a brace, a boom, a cable run. */
  beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, size: number, color: THREE.ColorRepresentation): this {
    const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const len = dir.length();
    Q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    M.compose(V.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), Q, ONE);
    return this.add(new THREE.BoxGeometry(size, len, size), color, M);
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    return merged;
  }
}

/** Painted or bare metal and concrete, coloured per vertex by the Kit. */
export const structureMaterial = (roughness = 0.72, metalness = 0.1) =>
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness });

export function shadowed<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.castShadow = cast;
  o.receiveShadow = receive;
  return o;
}
