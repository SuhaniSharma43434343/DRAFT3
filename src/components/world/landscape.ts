// The land: one height field that every other scene stands on, the rock formations that make the
// plain and the canyon, and the sky dome.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FINISH, SKY } from "./glsl";
import { WORLD } from "./journey";
import { PALETTE, type Quality, air, earthMaterial, loft, rockArch, rockColumn, shadowed } from "./kit";
import { fbm2, mix, sstep } from "./math";

const FLOOR = WORLD.floor;

/**
 * Ground height at (x, z). A corridor runs down x = 0: narrow through the canyon, opening into the
 * quarry basin (whose sides are cut into benches) and the yard, then dropping into the sea at the
 * coast. West of the port a headland carries the cliffs on out past the jetty.
 */
export function ground(x: number, z: number): number {
  const ax = Math.abs(x);
  const basin = sstep(-150, -230, z) * (1 - sstep(-560, -610, z));
  const yard = sstep(-570, -620, z);
  const open = sstep(110, 340, z);
  const half = 26 + basin * 122 + yard * 118 + open * 34;
  const rise = sstep(half, half + 110 + open * 160, ax);
  const broad = fbm2(x * 0.0042, z * 0.0042);
  const detail = fbm2(x * 0.017 + 7, z * 0.017 - 3);
  const high = (44 + broad * 124 + detail * 24) * (1 - open * 0.7);
  let h = rise * high;
  if (basin > 0.001) {
    // Quarry benches: the slope is cut into steps with a short batter between them.
    const bench = 13;
    const k = h / bench;
    const stepped = (Math.floor(k) + sstep(0.72, 1, k - Math.floor(k))) * bench;
    h = mix(h, stepped, basin);
  }
  const ripple = (fbm2(x * 0.045, z * 0.045) - 0.5) * 1.3 * (1 - yard);
  const dunes = open * (fbm2(x * 0.0075 + 31, z * 0.0075) - 0.35) * 16;
  let y = FLOOR + h + ripple + dunes;
  const headland = sstep(-250, -350, x) * (1 - sstep(-1060, -1260, z));
  const sea = sstep(-884, -930, z) * (1 - headland);
  y = mix(y, -16, sea);
  return y;
}

type Rock = [x: number, z: number, rx: number, rz: number, h: number, sharp: number, lean?: [number, number]];

// Hand-placed for the camera: two staggered walls for the dive, towers across the plain for the
// opening view, pinnacles behind the quarry and sea stacks off the headland.
// prettier-ignore
const ROCKS: Rock[] = [
  // canyon, west wall
  [-66, 250, 34, 46, 124, 3.2], [-60, 150, 30, 40, 168, 2.6, [8, -6]], [-52, 58, 22, 36, 138, 3.4],
  [-62, -30, 26, 34, 152, 2.8, [-4, 8]], [-56, -132, 24, 40, 112, 3.6],
  // canyon, east wall
  [72, 292, 40, 50, 142, 3], [62, 190, 28, 44, 192, 2.5, [-10, 4]], [58, 100, 26, 38, 150, 3.4],
  [54, 8, 20, 30, 122, 3], [66, -96, 30, 44, 172, 2.7, [6, 10]],
  // the plain
  [-270, 180, 62, 82, 212, 3.4], [-430, -60, 92, 112, 262, 3], [-196, 384, 36, 44, 132, 2.6],
  [246, 240, 54, 70, 232, 3.2], [386, -20, 82, 100, 282, 2.8], [176, 470, 26, 30, 244, 2.4, [-14, 0]],
  [-124, 432, 30, 34, 196, 2.6, [10, 6]], [-566, 300, 70, 92, 182, 3.6], [566, 330, 76, 92, 204, 3.2],
  [-336, -300, 70, 92, 242, 3], [306, -322, 76, 96, 252, 3.4], [-700, -80, 110, 130, 300, 3],
  [700, 80, 120, 130, 320, 3.2],
  // behind the quarry
  [-196, -300, 30, 40, 142, 2.6], [214, -424, 40, 50, 162, 2.8], [-236, -524, 44, 52, 152, 3.2],
  // sea stacks off the headland
  [-320, -1030, 28, 34, 96, 2.4], [-410, -1190, 34, 40, 128, 2.6, [8, 0]],
];

export function buildLandscape(q: Quality): THREE.Group {
  const group = new THREE.Group();

  // Terrain. Columns are packed toward the corridor, where the camera flies low.
  const half = 960;
  const z0 = -1320;
  const z1 = 660;
  const cols = q.small ? 120 : 210;
  const rows = q.small ? 130 : 230;
  const terrain = loft(rows, cols, false, (u, v, p) => {
    const s = v * 2 - 1;
    const x = Math.sign(s) * half * Math.pow(Math.abs(s), 1.7);
    const z = mix(z0, z1, u);
    p.set(x, ground(x, z), z);
  });
  const land = earthMaterial(q, {
    a: PALETTE.limestone,
    b: PALETTE.sandstone,
    seam: PALETTE.strata,
    sand: PALETTE.sand,
    strata: 0.85,
    sandAmount: 0.95,
    grain: 0.32,
    bump: 0.5,
  });
  // The terrain has no baked occlusion: white vertex colour.
  terrain.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(terrain.attributes.position.count * 3).fill(1), 3),
  );
  group.add(shadowed(new THREE.Mesh(terrain, land)));

  // Rock formations, merged into one mesh.
  const rocks = ROCKS.map(([x, z, rx, rz, h, sharp, lean], i) => {
    const base = ground(x, z);
    const g = rockColumn({
      rx,
      rz,
      h: h + Math.abs(FLOOR - base),
      sharp,
      lean,
      seed: i * 3.71 + 1.3,
      rows: q.small ? 22 : 34,
      cols: q.small ? 28 : 44,
    });
    return g.translate(x, Math.min(base, FLOOR), z);
  });
  // The arch the camera flies under as the canyon opens.
  rocks.push(rockArch(84, 46, 7.5, 5.2).translate(0, FLOOR - 2, -62));
  const rockMat = earthMaterial(q, {
    a: PALETTE.limestone,
    b: PALETTE.sandstone,
    seam: PALETTE.strata,
    sand: PALETTE.sand,
    strata: 1,
    sandAmount: 0.75,
    grain: 0.3,
    bump: 0.7,
  });
  const merged = mergeGeometries(rocks, false);
  rocks.forEach((g) => g.dispose());
  group.add(shadowed(new THREE.Mesh(merged, rockMat)));

  return group;
}

/** The sky: a dome that travels with the camera. Its horizon is the haze colour. */
export function buildSky(radius: number): THREE.Mesh {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: air,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        ${SKY}
        varying vec3 vDir;
        void main() {
          gl_FragColor = vec4(skyColor(normalize(vDir), 1.0), 1.0);
          ${FINISH}
        }`,
    }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}
