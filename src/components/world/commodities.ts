// The quarry basin: six stations, one per product segment in src/content/site.ts, each showing the
// commodities that segment actually lists. Bulk materials are stockpiles at their angle of repose
// with lumps of the material scattered over them; petroleum products are storage tanks; polymers
// are pellets and palletised sacks. Nothing here is a product the content does not name.

import * as THREE from "three";
import { WORLD } from "./journey";
import { Kit, type Quality, earthMaterial, heap, shadowed, structureMaterial } from "./kit";
import { ground } from "./landscape";
import { noise3 } from "./math";

type Lump = "rock" | "crystal" | "prill" | "shard" | "nut";

type Pile = {
  x: number;
  dz: number; // offset from the station along the course
  r: number;
  h: number;
  ridge?: number;
  a: string; // heap colours
  b: string;
  lump: Lump;
  lumpColor: string;
  size: number;
  rough?: number;
  metal?: number;
  count?: number;
};

// prettier-ignore
const STATIONS: Pile[][] = [
  // Cement & Construction Materials: cement clinker, gypsum
  [
    { x: 30, dz: -6, r: 17, h: 11, a: "#5b5a56", b: "#44433f", lump: "rock", lumpColor: "#4c4b47", size: 0.62 },
    { x: 62, dz: -36, r: 21, h: 14, ridge: 8, a: "#eae5d9", b: "#d8d0c0", lump: "crystal", lumpColor: "#f3efe6", size: 0.7, rough: 0.42 },
  ],
  // Minerals & Ores: iron ore, bauxite
  [
    { x: 31, dz: -4, r: 18, h: 12, a: "#6a4238", b: "#43302c", lump: "rock", lumpColor: "#573830", size: 0.66, rough: 0.7, metal: 0.25 },
    { x: 64, dz: -34, r: 20, h: 13, ridge: 6, a: "#b06c42", b: "#8e4f33", lump: "rock", lumpColor: "#a5623d", size: 0.55 },
  ],
  // Fertilizers & Industrial Materials: urea, sulphur
  [
    { x: 30, dz: -6, r: 16, h: 10.5, a: "#f1eee6", b: "#e2ddd2", lump: "prill", lumpColor: "#f6f3ec", size: 0.3, rough: 0.6 },
    { x: 61, dz: -34, r: 19, h: 12, a: "#d6bd4e", b: "#bfa23e", lump: "rock", lumpColor: "#d9c257", size: 0.6, rough: 0.8 },
  ],
  // Oil & Energy Products: built in buildTanks()
  [],
  // Polymers & Plastics: HDPE and LDPE pellets
  [
    { x: 30, dz: -4, r: 14, h: 8.5, a: "#f0f1ee", b: "#e3e6e3", lump: "prill", lumpColor: "#f7f8f5", size: 0.26, rough: 0.3 },
    { x: 58, dz: -32, r: 15, h: 9, a: "#e2e8e8", b: "#d3dcdc", lump: "prill", lumpColor: "#e9efee", size: 0.26, rough: 0.25 },
  ],
  // Metals & Agricultural Commodities: metal scrap, raw cashew nuts
  [
    { x: 31, dz: -6, r: 17, h: 10, a: "#70777b", b: "#4f5559", lump: "shard", lumpColor: "#9aa2a7", size: 1.1, rough: 0.5, metal: 0.2 },
    { x: 62, dz: -34, r: 17, h: 10, a: "#b98e5e", b: "#a17748", lump: "nut", lumpColor: "#c39a69", size: 0.5, rough: 0.6 },
  ],
];

function lumpGeometry(kind: Lump): THREE.BufferGeometry {
  if (kind === "crystal") return new THREE.CylinderGeometry(0.34, 0.5, 2.3, 6).rotateZ(0.5);
  if (kind === "prill") return new THREE.IcosahedronGeometry(1, 1);
  if (kind === "shard") {
    // Offcuts and plate: a bent strip.
    const g = new THREE.BoxGeometry(2.2, 0.12, 0.8, 4, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.22 * p.getX(i) * p.getX(i));
    g.computeVertexNormals();
    return g;
  }
  if (kind === "nut") {
    // The kidney shape of a raw cashew: a capsule bent along its length.
    const g = new THREE.CapsuleGeometry(0.34, 0.7, 3, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + 0.62 * p.getY(i) * p.getY(i));
    g.computeVertexNormals();
    return g;
  }
  // Crushed rock: an icosahedron pushed about by noise. Identical positions move identically, so
  // the facets stay closed without welding.
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(0.72 + 0.56 * noise3(v.x * 1.7 + 4, v.y * 1.7, v.z * 1.7)).multiply(new THREE.Vector3(1.15, 0.8, 1));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function buildTanks(k: Kit, z: number, y: number) {
  const shell = "#e4e3db";
  const band = "#a3abaf";
  const dark = "#6a7074";
  const tank = (x: number, tz: number, r: number, h: number) => {
    k.cyl(r, r, h, x, y + h / 2, tz, shell, 36);
    k.cyl(r + 0.12, r + 0.12, 0.5, x, y + h - 0.6, tz, band, 36); // wind girder
    k.cyl(r + 0.12, r + 0.12, 0.5, x, y + h * 0.5, tz, band, 36);
    k.cyl(0.6, r, h * 0.09, x, y + h + h * 0.045, tz, shell, 36); // cone roof
    k.cyl(r + 2.6, r + 2.6, 0.5, x, y + 0.25, tz, "#b5afa2", 36); // ring foundation
    k.cyl(r - 0.2, r - 0.2, 1.1, x, y + h + 0.5, tz, band, 36); // roof rail
    const steps = Math.round(h * 2.2);
    for (let i = 0; i < steps; i++) {
      // The spiral stair every tank of this kind carries, on the side the camera passes.
      const a = 2.2 + (i / steps) * 1.7;
      k.box(1.5, 0.12, 0.5, x + Math.cos(a) * (r + 0.75), y + 0.6 + (i / steps) * (h - 0.4), tz + Math.sin(a) * (r + 0.75), dark, -a);
    }
  };
  tank(40, z - 8, 11, 17);
  tank(70, z - 38, 14, 21);
  tank(84, z - 2, 9, 14);
  // Pipe run on sleepers from the tanks toward the yard.
  for (const [py, px] of [[1.1, 0], [1.1, 1.1], [1.9, 0.5]] as const) {
    k.add(new THREE.CylinderGeometry(0.34, 0.34, 64, 10).rotateX(Math.PI / 2), dark, new THREE.Matrix4().makeTranslation(22 + px, y + py, z - 20));
  }
  for (let i = 0; i < 9; i++) k.box(3.4, 0.7, 0.5, 22.5, y + 0.35, z + 10 - i * 7.5, "#a8a294");
  k.add(new THREE.CylinderGeometry(0.34, 0.34, 22, 10).rotateZ(Math.PI / 2), dark, new THREE.Matrix4().makeTranslation(33, y + 1.9, z - 8));
}

function buildSacks(k: Kit, x: number, z: number, y: number) {
  // Palletised 25 kg sacks, the way polymer is actually shipped.
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      const px = x + i * 1.75;
      const pz = z + j * 1.6;
      const layers = 4 + ((i * 3 + j * 5) % 3);
      k.box(1.3, 0.16, 1.1, px, y + 0.1, pz, "#a48a63");
      for (let n = 0; n < layers; n++) {
        k.box(1.22 - (n % 2) * 0.06, 0.24, 1.02, px + (n % 2 ? 0.03 : -0.03), y + 0.32 + n * 0.25, pz, n % 2 ? "#eceee9" : "#e2e6e2");
      }
    }
  }
}

export function buildCommodities(q: Quality): { heaps: THREE.Group; lumps: THREE.Group } {
  const heaps = new THREE.Group();
  const lumps = new THREE.Group();
  const kit = new Kit();
  const m = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let seed = 3;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  STATIONS.forEach((piles, k) => {
    const z0 = WORLD.stationZ(k);
    if (k === 3) buildTanks(kit, z0, ground(55, z0 - 20) + 0.1);
    if (k === 4) buildSacks(kit, 40, z0 - 30, ground(42, z0 - 28) + 0.05);
    piles.forEach((p, n) => {
      const z = z0 + p.dz;
      const y = ground(p.x, z);
      const pile = heap(p.r, p.h, k * 7.1 + n * 3.3 + 1, p.ridge ?? 0);
      const mesh = new THREE.Mesh(
        pile.geometry,
        earthMaterial(q, { a: p.a, b: p.b, strata: 0, grain: 1.7, bump: 0.22, roughness: p.rough ?? 0.92, metalness: (p.metal ?? 0) * 0.5 }),
      );
      mesh.position.set(p.x, y, z);
      heaps.add(shadowed(mesh));

      // Lumps of the material over the heap and spilled around its toe.
      const count = Math.round((p.count ?? 520) * (q.small ? 0.35 : 1));
      const inst = new THREE.InstancedMesh(
        lumpGeometry(p.lump),
        new THREE.MeshStandardMaterial({
          color: p.lumpColor,
          roughness: p.rough ?? 0.9,
          metalness: p.metal ?? 0,
          flatShading: p.lump !== "prill" && p.lump !== "nut",
        }),
        count,
      );
      const tint = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2;
        const spill = rnd() < 0.16;
        const u = spill ? 1 + rnd() * rnd() * 0.45 : Math.sqrt(rnd());
        pile.surface(Math.min(u, 1), a, pos);
        if (spill) pos.multiplyScalar(u).setY(-0.3);
        const s = p.size * (0.55 + rnd() * rnd() * 1.5) * (spill ? 0.8 : 1);
        pos.y += s * 0.25;
        m.compose(pos, quat.setFromEuler(eul.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3)), scl.setScalar(s));
        inst.setMatrixAt(i, m);
        inst.setColorAt(i, tint.setScalar(0.78 + rnd() * 0.3));
      }
      inst.position.copy(mesh.position);
      inst.receiveShadow = true;
      lumps.add(inst);
    });
  });

  heaps.add(shadowed(new THREE.Mesh(kit.build(), structureMaterial(0.62, 0.12))));
  return { heaps, lumps };
}
