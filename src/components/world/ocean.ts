// The sea. A sheet that travels with the camera, dense near it and coarse toward the horizon.
// The long swells move the surface itself; every wave, long and short, shapes the normal, which is
// computed per pixel from the same wave table. It reflects the sky function the dome is drawn
// with, so sea and sky always agree, and carries the carrier's wake.

import * as THREE from "three";
import { FINISH, HAZE, NOISE, SKY } from "./glsl";
import { PALETTE, type Quality, air } from "./kit";

// direction (unit, xz), wavelength (m), amplitude (m). The first SWELLS move geometry. Below
// these, the chop is noise rather than more sine waves: a handful of regular trains crossing each
// other reads as woven cloth, not water.
// prettier-ignore
const WAVES: [number, number, number, number][] = [
  [0.17, 0.98, 96, 0.9], [-0.34, 0.94, 61, 0.62],
  [0.5, 0.87, 37, 0.38], [-0.57, 0.82, 23, 0.24], [0.77, 0.64, 13.1, 0.11], [-0.87, 0.5, 8.7, 0.07],
];
const SWELLS = 2;

const WAVE_GLSL = /* glsl */ `
  const int WAVE_COUNT = ${WAVES.length};
  uniform vec4 uWaves[${WAVES.length}];
  // Phase of wave i at xz: deep-water dispersion, so long waves outrun short ones.
  float wavePhase(vec4 w, vec2 xz, float t) {
    float k = 6.28318 / w.z;
    return k * dot(w.xy, xz) - sqrt(9.81 * k) * t;
  }
`;

export type Ocean = {
  object: THREE.Mesh;
  /** ship = x, z, steaming 0..1; px = world units per pixel at distance 1. */
  update: (camera: THREE.Camera, shipX: number, shipZ: number, speed: number, px: number) => void;
};

export function buildOcean(q: Quality): Ocean {
  const n = q.small ? 120 : 200;
  const geo = new THREE.PlaneGeometry(2, 2, n, n).rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    // Pack the grid toward the centre: sub-metre cells by the camera, hundreds of metres far out.
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setXYZ(i, Math.sign(x) * Math.pow(Math.abs(x), 2) * 4200, 0, Math.sign(z) * Math.pow(Math.abs(z), 2) * 4200);
  }
  const uniforms = {
    ...air,
    uWaves: { value: WAVES.map((w) => new THREE.Vector4(...w)) },
    uDeep: { value: new THREE.Color(PALETTE.sea) },
    uLit: { value: new THREE.Color(PALETTE.seaLit) },
    uShip: { value: new THREE.Vector3(0, 0, 0) },
    uPx: { value: 0.001 },
  };
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      defines: { FBM_OCTAVES: 3 },
      vertexShader: /* glsl */ `
        uniform float uTime;
        ${WAVE_GLSL}
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          // Swell is faded out where the grid is too coarse to carry it.
          float fade = 1.0 - smoothstep(180.0, 520.0, distance(w.xz, cameraPosition.xz));
          for (int i = 0; i < ${SWELLS}; i++) {
            float f = wavePhase(uWaves[i], w.xz, uTime);
            w.xz += uWaves[i].xy * uWaves[i].w * 0.7 * cos(f) * fade;
            w.y += uWaves[i].w * sin(f) * fade;
          }
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uDeep;
        uniform vec3 uLit;
        uniform vec3 uShip;
        uniform float uPx;
        ${NOISE}
        ${SKY}
        ${HAZE}
        ${WAVE_GLSL}
        varying vec3 vW;
        void main() {
          vec3 toCam = cameraPosition - vW;
          float dist = length(toCam);
          vec3 V = toCam / dist;
          // Size of a pixel on the water, stretched at grazing angles. Waves shorter than a few
          // pixels are dropped from the normal, so the far sea is calm instead of noisy.
          float footprint = dist * uPx / max(V.y, 0.06);
          vec2 slope = vec2(0.0);
          float height = 0.0;
          float kept = 0.0;
          // A slow warp of the surface, so the short waves never line up into a weave.
          vec2 warp = 3.2 * vec2(vnoise(vec3(vW.xz * 0.021, 1.0)), vnoise(vec3(vW.xz * 0.021, 7.0)));
          for (int i = 0; i < WAVE_COUNT; i++) {
            vec4 w = uWaves[i];
            float keep = clamp(w.z / (footprint * 6.0) - 0.5, 0.0, 1.0);
            float f = wavePhase(w, vW.xz + (i < ${SWELLS} ? vec2(0.0) : warp), uTime);
            float k = 6.28318 / w.z;
            slope += w.xy * (k * w.w * cos(f) * keep);
            height += w.w * sin(f) * keep;
            kept += keep;
          }
          // Wind chop: two octaves of drifting noise, differentiated for their slope.
          float chopA = clamp(4.5 / (footprint * 6.0) - 0.5, 0.0, 1.0);
          float chopB = clamp(1.7 / (footprint * 6.0) - 0.5, 0.0, 1.0);
          if (chopA > 0.0) {
            vec3 q = vec3((vW.xz + warp) * 0.22 + uTime * vec2(0.22, 0.4), uTime * 0.3);
            float n0 = vnoise(q);
            slope += vec2(vnoise(q + vec3(0.3, 0.0, 0.0)) - n0, vnoise(q + vec3(0.0, 0.3, 0.0)) - n0) * (0.24 * chopA);
            vec3 r = vec3(vW.xz * 0.6 + uTime * vec2(-0.3, 0.55), uTime * 0.5);
            float m0 = vnoise(r);
            slope += vec2(vnoise(r + vec3(0.3, 0.0, 0.0)) - m0, vnoise(r + vec3(0.0, 0.3, 0.0)) - m0) * (0.26 * chopB);
          }
          kept = (kept + chopA * 2.0 + chopB * 2.0) / float(WAVE_COUNT + 4);

          // The carrier's wake, in the ship's frame: s runs aft from amidships, l is abeam.
          float s = vW.z - uShip.y;
          float l = abs(vW.x - uShip.x);
          float aft = s - 104.0;
          float churn = fbm(vec3(vW.xz * 0.16, uTime * 0.25));
          float trail = smoothstep(16.0 + aft * 0.03, 5.0, l) * smoothstep(-10.0, 18.0, aft) * exp(-max(aft, 0.0) / 820.0);
          float fromBow = s + 104.0;
          float arm = 15.0 + fromBow * 0.33;
          float kelvin = exp(-pow((l - arm) / (2.5 + fromBow * 0.022), 2.0)) * smoothstep(0.0, 50.0, fromBow) * exp(-fromBow / 620.0);
          float alongside = smoothstep(20.5, 16.4, l) * smoothstep(118.0, 104.0, abs(s));
          float foam = uShip.z * clamp(trail * (0.3 + churn * 1.1) + kelvin * (0.12 + churn * 0.55) + alongside * 0.4 * churn, 0.0, 1.0);
          slope += uShip.z * kelvin * 0.12 * vec2(sign(vW.x - uShip.x), 0.3);

          vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
          float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 R = reflect(-V, N);
          R.y = abs(R.y);
          vec3 sky = skyColor(R, 0.0);
          // Light scattered back out of the lifted water.
          vec3 body = mix(uDeep, uLit, clamp(height * 0.28 + 0.34, 0.0, 1.0) * (0.45 + 0.55 * max(uSunDir.y, 0.0)));
          vec3 col = mix(body, sky, fresnel);
          // Sun glitter: tight where the short waves survive, broader where they have been dropped.
          vec3 H = normalize(uSunDir + V);
          float shine = mix(60.0, 520.0, kept);
          col += uSunCol * pow(max(dot(N, H), 0.0), shine) * mix(0.5, 3.2, kept);
          col = mix(col, vec3(0.93, 0.95, 0.94), foam * 0.88);
          gl_FragColor = vec4(haze(col, dist), 1.0);
          ${FINISH}
        }`,
    }),
  );
  mesh.frustumCulled = false;

  return {
    object: mesh,
    update(camera, shipX, shipZ, speed, px) {
      // Snap to a coarse grid so the sheet's own vertices do not swim through the swell.
      mesh.position.set(Math.round(camera.position.x / 12) * 12, 0, Math.round(camera.position.z / 12) * 12);
      uniforms.uShip.value.set(shipX, shipZ, speed);
      uniforms.uPx.value = px;
    },
  };
}
