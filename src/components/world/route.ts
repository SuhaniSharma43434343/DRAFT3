// The gold route: one unbroken line from the first rock formation to the globe. It lies on the
// canyon floor, runs through the warehouse and along the jetty, crosses the sea ahead of the
// carrier, and ends on Dubai. Scroll draws it; it is never thinner than a couple of pixels, so it
// reads as the same thread from a metre away or from a kilometre up.
//
// Also here: the dust in the air, which is what makes the scale of the place visible.

import * as THREE from "three";
import { FINISH, HAZE } from "./glsl";
import { ROUTE_RELEASE, ROUTE_TIMING, WORLD } from "./journey";
import { ground } from "./landscape";
import { PALETTE, type Quality, air } from "./kit";
import { mix, sstep } from "./math";

const routeX = (z: number) =>
  70 * sstep(280, 470, z) + 3 * Math.sin(z * 0.011) * sstep(-170, -40, z) * (1 - sstep(200, 300, z));

function routeY(x: number, z: number): number {
  const land = Math.max(ground(x, z), z < -600 ? WORLD.floor + 0.25 : -99) + 0.12;
  return mix(land, 1.8, sstep(WORLD.jetty.z1 + 6, WORLD.jetty.z1 - 40, z));
}

/** Journey time at which the drawing head reaches course position z. */
function arrival(z: number): number {
  const k = ROUTE_TIMING;
  if (z >= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (z >= k[i][0]) return mix(k[i - 1][1], k[i][1], (k[i - 1][0] - z) / (k[i - 1][0] - k[i][0]));
  }
  return k[k.length - 1][1];
}

export type Route = {
  object: THREE.Mesh;
  /** head = journey time the line is drawn up to; px = world units per pixel at distance 1. */
  update: (head: number, t: number, px: number) => void;
};

export function buildRoute(): Route {
  // Sample the course: every few metres on land, where it follows the ground, sparser at sea.
  const zs: number[] = [];
  for (let z = 470; z > WORLD.jetty.z1 - 60; z -= 4) zs.push(z);
  for (let z = WORLD.jetty.z1 - 60; z > WORLD.hub[2]; z -= 22) zs.push(z);
  zs.push(WORLD.hub[2]);
  const pts = zs.map((z) => {
    const x = routeX(z);
    return new THREE.Vector3(x, routeY(x, z), z);
  });

  const RING = 6;
  const n = pts.length;
  const pos = new Float32Array(n * RING * 3);
  const radial = new Float32Array(n * RING * 3);
  const time = new Float32Array(n * RING);
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const r = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    tan.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    side.set(0, 1, 0).cross(tan).normalize();
    up.crossVectors(tan, side);
    for (let j = 0; j < RING; j++) {
      const a = (j / RING) * Math.PI * 2;
      r.copy(side).multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
      pts[i].toArray(pos, (i * RING + j) * 3);
      r.toArray(radial, (i * RING + j) * 3);
      time[i * RING + j] = arrival(pts[i].z);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < RING; j++) {
      const a = i * RING + j;
      const b = i * RING + ((j + 1) % RING);
      idx.push(a, b, a + RING, b, b + RING, a + RING);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aRadial", new THREE.BufferAttribute(radial, 3));
  geo.setAttribute("aT", new THREE.BufferAttribute(time, 1));
  geo.setIndex(idx);

  const uniforms = {
    ...air,
    uHead: { value: -1 },
    uTail: { value: -9 },
    uPx: { value: 0.001 },
    uGold: { value: new THREE.Color(PALETTE.gold) },
    uHot: { value: new THREE.Color("#fff1cf") },
  };
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float uPx;
        uniform vec3 uSunDir;
        attribute vec3 aRadial;
        attribute float aT;
        varying float vT;
        varying vec3 vN;
        varying vec3 vView;
        varying vec3 vSun;
        void main() {
          vec4 centre = modelViewMatrix * vec4(position, 1.0);
          // A band 0.36 m wide set into the ground; never less than about 2.4 px across from afar.
          float radius = max(0.18, -centre.z * uPx * 1.2);
          // As it widens with distance it also lifts, so the terrain never swallows it.
          vec3 placed = position + aRadial * vec3(1.0, 0.4, 1.0) * radius + vec3(0.0, (radius - 0.18) * 0.9, 0.0);
          vec4 mv = modelViewMatrix * vec4(placed, 1.0);
          vT = aT;
          vN = normalMatrix * aRadial;
          vView = -mv.xyz;
          vSun = (viewMatrix * vec4(uSunDir, 0.0)).xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uHorizon;
        uniform float uHead;
        uniform float uTail;
        uniform float uTime;
        uniform vec3 uGold;
        uniform vec3 uHot;
        ${HAZE}
        varying float vT;
        varying vec3 vN;
        varying vec3 vView;
        varying vec3 vSun;
        void main() {
          if (vT > uHead || vT < uTail) discard;
          vec3 n = normalize(vN);
          vec3 v = normalize(vView);
          float lit = 0.66 + 0.34 * max(dot(n, vSun), 0.0);
          float spec = pow(max(dot(n, normalize(vSun + v)), 0.0), 24.0);
          float tip = smoothstep(uHead - 0.045, uHead, vT);
          // A slow glint that keeps travelling the way the trade does.
          float glint = smoothstep(0.96, 1.0, sin(vT * 26.0 - uTime * 0.9) * 0.5 + 0.5);
          // Far off, on pale ground, the gold is drawn a tone deeper so the thread still reads.
          vec3 gold = mix(uGold, uGold * vec3(0.8, 0.72, 0.5), smoothstep(60.0, 420.0, length(vView)));
          vec3 col = gold * lit + uHot * (spec * 0.5 + tip * 0.8 + glint * 0.22);
          // Half the haze the rest of the world gets: the line carries through distance.
          col = mix(col, haze(col, length(vView)), 0.4);
          gl_FragColor = vec4(col, 1.0);
          ${FINISH}
        }`,
    }),
  );
  mesh.frustumCulled = false;

  return {
    object: mesh,
    update(head, t, px) {
      uniforms.uHead.value = head;
      uniforms.uTail.value = mix(-9, 12, sstep(ROUTE_RELEASE[0], ROUTE_RELEASE[1], t));
      uniforms.uPx.value = px;
    },
  };
}

// ── Dust ─────────────────────────────────────────────────────────────────────
// A box of motes that wraps around the camera, so there is always air between the lens and the
// rock. Bright against shadow, invisible against the sky, like the real thing.

export type Dust = { object: THREE.Points; update: (camera: THREE.Camera, amount: number, scale: number) => void };

export function buildDust(q: Quality): Dust {
  const count = q.small ? 1300 : 3600;
  const seed = new Float32Array(count * 3);
  const size = new Float32Array(count);
  let s = 9;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    seed[i * 3] = rnd();
    seed[i * 3 + 1] = rnd();
    seed[i * 3 + 2] = rnd();
    size[i] = 0.05 + rnd() * rnd() * 0.3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(seed, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  const uniforms = {
    uTime: air.uTime,
    uCam: { value: new THREE.Vector3() },
    uAmount: { value: 0 },
    uScale: { value: 1 },
    uColor: { value: new THREE.Color("#fff6e4") },
  };
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCam;
        uniform float uAmount;
        uniform float uScale;
        attribute float aSize;
        varying float vA;
        const vec3 BOX = vec3(220.0, 110.0, 220.0);
        void main() {
          vec3 drift = vec3(uTime * 1.1, sin(uTime * 0.21 + position.x * 40.0) * 1.6 - uTime * 0.12, uTime * 0.5);
          vec3 p = position * BOX + drift * (0.4 + position.y);
          p = mod(p - uCam + BOX * 0.5, BOX) - BOX * 0.5 + uCam;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          gl_PointSize = min(aSize * uScale / max(d, 0.5), 14.0);
          vA = uAmount * smoothstep(105.0, 60.0, length(p - uCam)) * smoothstep(1.5, 9.0, d)
             * (0.55 + 0.45 * sin(uTime * 0.7 + position.z * 90.0));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          gl_FragColor = vec4(uColor, smoothstep(1.0, 0.1, d) * vA * 0.6);
          ${FINISH}
        }`,
    }),
  );
  points.frustumCulled = false;
  points.renderOrder = 5;
  return {
    object: points,
    update(camera, amount, scale) {
      uniforms.uCam.value.copy(camera.position);
      uniforms.uAmount.value = amount;
      uniforms.uScale.value = scale;
    },
  };
}
