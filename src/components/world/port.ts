// The port: a bulk jetty with its conveyor and two shiploaders, a container quay across the
// basin, and the bulk carrier that the journey follows out to sea.

import * as THREE from "three";
import { WORLD } from "./journey";
import { Kit, loft, shadowed, structureMaterial } from "./kit";
import { mix, sstep } from "./math";

const FLOOR = WORLD.floor;
const J = WORLD.jetty;

const STEEL = "#6d7a83";
const STEEL_DARK = "#4a545a";
const IVORY = "#e6e1d5";
const CONCRETE = "#b3ada0";
const CONCRETE_DARK = "#8f897c";

function shiploader(k: Kit, z: number) {
  const deck = FLOOR + 0.3;
  // Travelling portal on four legs, braced.
  for (const sx of [-9, 9]) {
    for (const sz of [-7, 7]) {
      k.box(1.3, 15, 1.3, sx, deck + 7.5, z + sz, STEEL);
      k.box(2.4, 1.1, 3.4, sx, deck + 0.55, z + sz, STEEL_DARK); // bogies
    }
    k.beam(sx, deck + 2, z - 7, sx, deck + 13, z + 7, 0.5, STEEL);
    k.beam(sx, deck + 2, z + 7, sx, deck + 13, z - 7, 0.5, STEEL);
  }
  k.box(21, 1.6, 17, 0, deck + 15.6, z, STEEL);
  // Machinery house and the slewing tower.
  k.box(9, 6, 11, -3, deck + 19.4, z, IVORY);
  k.box(9.4, 0.5, 11.4, -3, deck + 22.6, z, STEEL_DARK);
  k.cyl(2.2, 2.6, 9, 4, deck + 21, z, STEEL, 12);
  // Boom out over the ship's hold, with its lattice top chord and the loading spout.
  const by = deck + 23;
  k.box(42, 2.4, 3, 25, by, z, STEEL);
  k.beam(4, by + 1.2, z, 46, by + 1.2, z, 0.5, STEEL_DARK);
  for (let i = 0; i < 7; i++) {
    const x0 = 6 + i * 6;
    k.beam(x0, by + 1.2, z - 1.4, x0 + 3, by + 4.2, z, 0.3, STEEL_DARK);
    k.beam(x0 + 3, by + 4.2, z, x0 + 6, by + 1.2, z + 1.4, 0.3, STEEL_DARK);
  }
  k.beam(6, by + 4.2, z, 48, by + 4.2, z, 0.4, STEEL_DARK);
  k.box(2.6, 12, 2.6, 31, by - 7, z, STEEL_DARK); // telescopic spout
  k.cyl(1.9, 1.2, 2.4, 31, by - 14, z, STEEL_DARK, 10);
  // Mast, stays and counterweight.
  k.beam(2, by + 1, z - 2.4, 4, by + 17, z, 0.7, STEEL);
  k.beam(6, by + 1, z + 2.4, 4, by + 17, z, 0.7, STEEL);
  k.beam(4, by + 17, z, 44, by + 4.4, z, 0.28, STEEL_DARK);
  k.beam(4, by + 17, z, -14, by + 2, z, 0.28, STEEL_DARK);
  k.box(14, 2, 3, -9, by, z, STEEL);
  k.box(5, 4.4, 5, -15, by - 0.4, z, CONCRETE_DARK);
}

function gantryCrane(k: Kit, x: number, z: number) {
  // Ship-to-shore container crane: portal, A-frame and a boom out over the water (toward -x).
  const y = FLOOR + 0.4;
  const paint = "#c9c4b6";
  for (const sx of [0, 30]) {
    for (const sz of [-9, 9]) k.box(1.8, 46, 1.8, x + sx, y + 23, z + sz, paint);
    k.box(1.4, 1.4, 18, x + sx, y + 30, z, paint);
    k.beam(x + sx, y + 6, z - 9, x + sx, y + 28, z + 9, 0.6, paint);
  }
  for (const sz of [-9, 9]) {
    k.box(31.8, 1.8, 1.6, x + 15, y + 46, z + sz, paint);
    k.beam(x, y + 18, z + sz, x + 30, y + 44, z + sz, 0.6, paint);
  }
  k.box(118, 3.2, 5, x - 16, y + 49, z, paint); // boom and back-reach girder
  k.box(8, 5, 8, x + 22, y + 53, z, IVORY); // machinery house
  k.beam(x + 2, y + 50, z, x + 6, y + 76, z, 1.3, paint); // A-frame
  k.beam(x + 28, y + 50, z, x + 6, y + 76, z, 1.1, paint);
  k.beam(x + 6, y + 76, z, x - 70, y + 51, z, 0.45, STEEL_DARK); // forestays
  k.beam(x + 6, y + 76, z, x - 34, y + 51, z, 0.45, STEEL_DARK);
  k.beam(x + 6, y + 76, z, x + 42, y + 51, z, 0.45, STEEL_DARK);
  k.box(5, 3.4, 4, x - 38, y + 45.6, z, STEEL_DARK); // trolley and cab
  k.box(0.5, 12, 0.5, x - 38, y + 38, z, STEEL_DARK);
  k.box(12.4, 0.7, 2.6, x - 38, y + 32, z, STEEL_DARK); // spreader
}

export function buildPort(): THREE.Group {
  const group = new THREE.Group();
  const k = new Kit();
  const len = J.z0 - J.z1;
  const mid = (J.z0 + J.z1) / 2;
  const deck = FLOOR + 0.3;

  // Sea wall along the yard.
  k.box(520, 20, 5, -10, FLOOR - 9.7, WORLD.coast + 6, CONCRETE);
  k.box(520, 0.9, 1, -10, FLOOR + 0.75, WORLD.coast + 4, CONCRETE_DARK);

  // Jetty: deck on piles, kerbs, fenders along the berth, bollards.
  k.box(J.half * 2, 2.6, len, 0, deck - 1.3, mid, CONCRETE);
  for (const sx of [-1, 1]) k.box(0.7, 0.5, len, sx * (J.half - 0.4), deck + 0.25, mid, CONCRETE_DARK);
  for (let z = J.z0 - 8; z > J.z1; z -= 16) {
    for (const sx of [-1, 0, 1]) k.cyl(1, 1, 18, sx * (J.half - 2), deck - 11.4, z, CONCRETE_DARK, 10);
    k.box(J.half * 2, 1.2, 1.6, 0, deck - 3.1, z, CONCRETE_DARK); // pile cap
  }
  for (let z = -950; z > -1200; z -= 16) {
    k.box(1.6, 3.6, 3.2, J.half + 0.8, deck - 2.2, z, "#33383b"); // fenders
    k.cyl(0.45, 0.6, 0.9, J.half - 1.6, deck + 0.45, z + 8, STEEL_DARK, 8); // bollards
  }
  // Crane rails.
  for (const x of [-9, 9]) k.box(0.3, 0.16, len - 20, x, deck + 0.08, mid, STEEL_DARK);

  // Conveyor gallery: out of the warehouse, down the jetty, feeding both loaders.
  const gy = FLOOR + 12.4;
  const gx = 6.5;
  const g0 = WORLD.hall.z1 + 6;
  const g1 = -1128;
  k.box(3.4, 3, g0 - g1, gx, gy, (g0 + g1) / 2, "#c4c5bf");
  k.box(3.8, 0.3, g0 - g1, gx, gy + 1.65, (g0 + g1) / 2, STEEL_DARK);
  for (let z = g0 - 14; z > g1; z -= 24) {
    k.beam(gx - 3.4, deck, z, gx - 1.2, gy - 1.5, z, 0.55, "#9aa5ab");
    k.beam(gx + 3.4, deck, z, gx + 1.2, gy - 1.5, z, 0.55, "#9aa5ab");
    k.beam(gx - 2.6, deck + 4, z, gx + 2.6, deck + 4, z, 0.4, "#9aa5ab");
  }
  shiploader(k, -1036);
  shiploader(k, -1116);

  // Container quay across the basin: deck, cranes, and the stacks behind them.
  const qx = 256;
  k.box(480, 22, 300, qx + 240, FLOOR - 10.7, -1044, CONCRETE);
  k.box(1.4, 0.8, 300, qx + 0.9, FLOOR + 0.7, -1044, CONCRETE_DARK);
  for (const z of [-950, -1022, -1094, -1166]) gantryCrane(k, qx + 8, z);
  const boxes = ["#8a4d3e", "#5f6f7c", "#b8ac93", "#4e5356", "#9a7b52", "#6f7f77"];
  let n = 0;
  for (let bx = 0; bx < 5; bx++) {
    for (let bz = 0; bz < 9; bz++) {
      const tiers = 2 + ((bx * 5 + bz * 3) % 4);
      for (let t = 0; t < tiers; t++) {
        for (let row = 0; row < 3; row++) {
          k.box(12.2, 2.6, 2.44, qx + 78 + bx * 15.5, FLOOR + 0.45 + 1.3 + t * 2.62, -912 - bz * 31 - row * 2.6, boxes[n++ % boxes.length]);
        }
      }
    }
  }

  group.add(shadowed(new THREE.Mesh(k.build(), structureMaterial(0.74, 0.18))));
  return group;
}

// ── The bulk carrier ─────────────────────────────────────────────────────────
// Origin amidships at the waterline, bow toward -Z. A Panamax-size geared bulker: seven holds,
// four deck cranes, accommodation and funnel aft.

export function buildShip(): THREE.Group {
  const ship = new THREE.Group();
  const L = WORLD.ship.length;
  const HB = WORLD.ship.beam / 2;
  const KEEL = -9;
  const deckAt = (u: number) => 9.6 + 2.6 * sstep(0.9, 1, u) + 1.1 * (1 - sstep(0.07, 0.13, u));
  // Half-breadth along the length: transom aft, long parallel middle body, a full, blunt bow.
  const breadth = (u: number) => {
    const aft = mix(0.66, 1, sstep(0, 0.11, u));
    const s = Math.max(0, (u - 0.85) / 0.15);
    return aft * Math.pow(Math.max(0, 1 - Math.pow(s, 2.5)), 0.6);
  };
  const zAt = (u: number) => L / 2 - u * L;
  const hullColor = new THREE.Color("#47535b");
  const bootColor = new THREE.Color("#7b3f33");

  const hull = loft(
    72,
    44,
    false,
    (u, v, p) => {
      // The section is a superellipse walked by polar angle, which spaces the plating evenly
      // down the side and across the bottom: boxy amidships, finer toward the ends.
      const a = v * Math.PI;
      const full = sstep(0, 0.14, u) * (1 - sstep(0.8, 1, u));
      const e = mix(2.4, 9, full);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const r = Math.pow(Math.pow(Math.abs(c), e) + Math.pow(s, e), -1 / e);
      const keel = KEEL + 7.5 * Math.pow(1 - sstep(0, 0.13, u), 2);
      const top = deckAt(u);
      const y = top - (top - keel) * s * r;
      const rake = ((y - KEEL) / (top - KEEL)) * 7 * sstep(0.86, 1, u);
      p.set(HB * breadth(u) * c * r, y, zAt(u) - rake);
    },
    { solid: true },
  );
  // The boot-topping is painted in the shader, by height, so the waterline is a clean line with
  // its pale draught mark above it instead of a saw-tooth between vertices.
  const paint = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.2 });
  paint.onBeforeCompile = (shader) => {
    shader.uniforms.uBoot = { value: bootColor };
    shader.uniforms.uHull = { value: hullColor };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vHullY;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHullY = position.y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vHullY;\nuniform vec3 uBoot;\nuniform vec3 uHull;")
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        diffuseColor.rgb = mix(uBoot, uHull, smoothstep(0.84, 0.9, vHullY));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.73, 0.69), smoothstep(0.9, 0.94, vHullY) * (1.0 - smoothstep(1.14, 1.18, vHullY)));`,
      );
  };
  ship.add(shadowed(new THREE.Mesh(hull, paint)));

  const k = new Kit();
  // Weather deck, laid between the sheer lines.
  const deck = loft(
    72,
    1,
    false,
    (u, v, p) => {
      const top = deckAt(u);
      const rake = 7 * sstep(0.86, 1, u);
      p.set((v * 2 - 1) * HB * breadth(u) * 0.985, top - 0.05, zAt(u) - rake);
    },
    { flip: true },
  );
  k.add(deck, "#7e4c3c");
  // Transom.
  k.box(HB * 2 * 0.66 * 0.97, 9.6, 0.5, 0, 5.9, L / 2 - 0.2, "#47535b");
  k.box(HB * 2 * 0.66 * 0.9, 2.2, 0.5, 0, 0.2, L / 2 - 0.4, "#7b3f33");

  // Seven holds: coaming, side-rolling covers with their centre seam.
  const D = 9.6;
  const holdZ = (i: number) => 62 - i * 25.4;
  for (let i = 0; i < 7; i++) {
    const z = holdZ(i);
    k.box(22.4, 1.5, 19.4, 0, D + 0.75, z, "#565d62");
    k.box(11.4, 0.8, 20.2, -5.8, D + 1.9, z, "#8a9196");
    k.box(11.4, 0.8, 20.2, 5.8, D + 1.9, z, "#8a9196");
    for (let r = -1; r <= 1; r++) k.box(23.2, 0.24, 0.5, 0, D + 2.4, z + r * 6.2, "#70777c");
  }
  // Four deck cranes between the holds, jibs stowed fore and aft.
  for (const i of [0, 2, 4, 5]) {
    const z = holdZ(i) - 12.7;
    k.cyl(1.7, 2, 11, 0, D + 5.5, z, IVORY, 14);
    k.box(4.2, 4.4, 5.2, 0, D + 13, z, IVORY);
    k.box(4.6, 0.3, 5.6, 0, D + 15.3, z, STEEL_DARK);
    k.beam(0, D + 14, z - 2, 0, D + 17, z - 26, 1.2, IVORY);
    k.beam(0, D + 15.2, z + 1, 0, D + 17.4, z - 25, 0.2, STEEL_DARK);
  }
  // Accommodation block, bridge, funnel, masts, lifeboat.
  const P = D + 1.1; // poop deck
  const az = L / 2 - 27;
  k.box(27, 3, 20, 0, P + 1.5, az + 1, IVORY);
  k.box(25, 12, 15, 0, P + 9, az, IVORY);
  for (let lv = 0; lv < 4; lv++) k.box(25.15, 0.6, 15.15, 0, P + 4.7 + lv * 3, az, "#3a4246"); // window bands
  k.box(33, 3.2, 9, 0, P + 16.6, az - 2.4, IVORY); // bridge with its wings
  k.box(33.15, 0.9, 9.15, 0, P + 17, az - 2.4, "#3a4246");
  k.box(26, 0.4, 13, 0, P + 18.4, az - 1, "#cfcabd");
  k.cyl(0.35, 0.5, 9, 0, P + 23, az - 2, IVORY, 8);
  k.box(5, 0.4, 0.6, 0, P + 25.5, az - 2, IVORY);
  k.box(12, 6, 9, 0, P + 6, az + 13, IVORY); // engine casing
  k.cyl(2.4, 3.1, 9, 0, P + 13.5, az + 13.5, "#47535b", 10); // funnel
  k.cyl(2.5, 2.5, 1.3, 0, P + 16.6, az + 13.5, "#2b3033", 10);
  k.box(3, 3, 9.5, 8, P + 2.2, az + 15, "#c0622f", 0, -0.42); // free-fall lifeboat on its ramp
  // Forecastle gear and foremast.
  k.box(9, 1.6, 5, 0, deckAt(0.96) + 0.8, zAt(0.955) - 5, "#565d62");
  k.cyl(0.3, 0.5, 11, 0, deckAt(0.97) + 5.5, zAt(0.965) - 6, IVORY, 8);
  // Rails read as a pale line along the sheer.
  for (const sx of [-1, 1]) k.box(0.25, 1.1, L * 0.7, sx * (HB - 0.5), D + 0.55, 6, "#c9c4b6");

  ship.add(shadowed(new THREE.Mesh(k.build(), structureMaterial(0.66, 0.12))));
  return ship;
}
