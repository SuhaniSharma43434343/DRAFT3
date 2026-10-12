// The bulk warehouse: a steel portal-frame shed with open strips in the roof, a clerestory on the
// sun side, concrete bays of material down both walls and a clear aisle the route runs through.
// The sun does the lighting: it comes through the roof strips as real shadow-mapped light, and
// the sheets of lit dust under each strip are drawn on top.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FINISH } from "./glsl";
import { WORLD } from "./journey";
import { Kit, type Quality, air, earthMaterial, heap, shadowed, structureMaterial } from "./kit";

const { z0, z1, half, eave, ridge, door } = WORLD.hall;
const FLOOR = WORLD.floor;
const BAY = 24;
const STRIP = 4; // width of the open roof strip in each bay

// Bulk in the bays, cycling through the materials the company trades.
const STOCK = ["#56554f", "#e6e0d3", "#69433a", "#ab6a43", "#efece4", "#cdb54c", "#727a7e", "#b68c5d"];

export function buildWarehouse(q: Quality): THREE.Group {
  const group = new THREE.Group();
  const k = new Kit();
  const length = z0 - z1;
  const mid = (z0 + z1) / 2;
  const frame = "#5f686d";
  const clad = "#aab1b3";
  const concrete = "#b4aea1";
  const E = FLOOR + eave;
  const R = FLOOR + ridge;

  // Slab, and an apron front and back.
  k.box(half * 2 + 10, 0.6, length + 44, 0, FLOOR - 0.12, mid, "#a59f92");

  // Long walls: a concrete push wall with cladding above. The east wall (the sun's side) is
  // open in a clerestory band so light rakes across the bays.
  for (const side of [-1, 1]) {
    const x = side * half;
    k.box(0.8, 6, length, x, FLOOR + 3, mid, concrete);
    if (side < 0) k.box(0.3, eave - 6, length, x, FLOOR + 6 + (eave - 6) / 2, mid, clad);
    else {
      k.box(0.3, 6.5, length, x, FLOOR + 9.25, mid, clad);
      k.box(0.3, eave - 17.5, length, x, FLOOR + 17.5 + (eave - 17.5) / 2, mid, clad);
    }
  }

  // Gable ends: a door 2 x `door` wide, cladding beside and above it, and the gable triangle.
  const doorH = 18;
  for (const z of [z0, z1]) {
    for (const side of [-1, 1]) {
      const w = half - door;
      k.box(w, eave, 0.5, side * (door + w / 2), FLOOR + eave / 2, z, clad);
      k.box(1.2, doorH, 1.2, side * door, FLOOR + doorH / 2, z, frame); // door jambs
    }
    k.box(door * 2, eave - doorH, 0.5, 0, FLOOR + doorH + (eave - doorH) / 2, z, clad);
    k.box(door * 2 + 2.4, 1.2, 1.4, 0, FLOOR + doorH + 0.6, z, frame); // lintel
    const tri = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, ridge - eave)]);
    k.add(new THREE.ShapeGeometry(tri), clad, new THREE.Matrix4().makeTranslation(0, E, z));
  }

  // Portal frames, purlins, and the roof sheeting between the open strips.
  const frames = Math.round(length / BAY);
  const slope = Math.atan2(ridge - eave, half);
  const rafter = Math.hypot(half, ridge - eave);
  for (let i = 0; i <= frames; i++) {
    const z = z0 - i * BAY;
    for (const side of [-1, 1]) {
      k.box(1, eave, 1.3, side * (half - 0.9), FLOOR + eave / 2, z, frame);
      k.beam(side * (half - 0.9), E - 0.4, z, 0, R - 0.4, z, 1, frame);
      k.beam(side * (half - 0.9), E - 5, z, side * (half - 9), E + 1.4, z, 0.6, frame); // haunch
    }
    k.beam(-half * 0.42, FLOOR + eave + (ridge - eave) * 0.56, z, half * 0.42, FLOOR + eave + (ridge - eave) * 0.56, z, 0.5, frame); // collar tie
    if (i === frames) break;
    // Sheeting covers each bay except its open strip, which sits just behind the frame.
    const sheet = BAY - STRIP;
    for (const side of [-1, 1]) {
      k.box(rafter + 0.6, 0.25, sheet, (side * half) / 2, (E + R) / 2 + 0.5, z - STRIP - sheet / 2, clad, 0, 0, -side * slope);
    }
  }
  for (const side of [-1, 1]) {
    for (let p = 1; p <= 5; p++) {
      const f = p / 6;
      k.box(0.3, 0.4, length, side * half * (1 - f), E + (ridge - eave) * f + 0.1, mid, frame);
    }
  }
  k.box(0.5, 0.5, length, 0, R, mid, frame);

  // Bays: concrete divider walls off both long walls.
  for (let i = 0; i <= frames; i++) {
    const z = z0 - i * BAY;
    for (const side of [-1, 1]) k.box(half - 20, 5.2, 0.7, side * (20 + (half - 20) / 2), FLOOR + 2.6, z, concrete);
  }

  const structure = structureMaterial(0.78, 0.15);
  structure.side = THREE.DoubleSide; // thin sheeting has to shadow from either face
  group.add(shadowed(new THREE.Mesh(k.build(), structure)));

  // Stock in the bays: every heap is tinted through its vertex colours so they share one mesh.
  const heaps: THREE.BufferGeometry[] = [];
  const tint = new THREE.Color();
  let n = 0;
  for (let i = 0; i < frames; i++) {
    for (const side of [-1, 1]) {
      const pile = heap(9.4, 6.5 + ((n * 7) % 5) * 0.9, n * 2.7 + 11, 2.5).geometry;
      tint.set(STOCK[n % STOCK.length]);
      const c = pile.attributes.color;
      for (let v = 0; v < c.count; v++) c.setXYZ(v, c.getX(v) * tint.r, c.getY(v) * tint.g, c.getZ(v) * tint.b);
      heaps.push(pile.translate(side * 30.5, FLOOR + 0.2, z0 - i * BAY - BAY / 2));
      n++;
    }
  }
  const stock = mergeGeometries(heaps, false);
  heaps.forEach((g) => g.dispose());
  group.add(shadowed(new THREE.Mesh(stock, earthMaterial(q, { a: "#ffffff", b: "#d9d9d9", strata: 0, grain: 1.8, bump: 0.2 }))));

  // Sheets of sunlit dust under the roof strips.
  const sun = air.uSunDir.value;
  const drop = (R - 2 - FLOOR) / sun.y;
  const fall = new THREE.Vector3(-sun.x * drop, -sun.y * drop, -sun.z * drop);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < frames; i++) {
    const z = z0 - i * BAY - STRIP / 2;
    const b = pos.length / 3;
    const y = R - 2;
    pos.push(-half + 6, y, z, half - 6, y, z, half - 6 + fall.x, y + fall.y, z + fall.z, -half + 6 + fall.x, y + fall.y, z + fall.z);
    uv.push(0, 1, 1, 1, 1, 0, 0, 0);
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  const sheets = new THREE.BufferGeometry();
  sheets.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  sheets.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  sheets.setIndex(idx);
  const shafts = new THREE.Mesh(
    sheets,
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color("#fff7e8") }, uTime: air.uTime },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          // Streaks along the fall of the light, soft at both ends and both sides.
          float streak = 0.55 + 0.45 * sin(vUv.x * 61.0 + sin(vUv.x * 17.0) * 3.0 + uTime * 0.05);
          float a = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
          gl_FragColor = vec4(uColor * a * streak * 0.026, 1.0);
          ${FINISH}
        }`,
    }),
  );
  shafts.renderOrder = 4;
  if (!q.small) group.add(shafts);

  return group;
}
