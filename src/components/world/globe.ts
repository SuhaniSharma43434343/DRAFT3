// The globe the journey ends on. It is the trade-route globe this site already had (same land
// data, same routes.json, same great-circle arcs and region focus), recut for the light theme: a
// honed stone sphere with the continents standing in relief, and the routes inlaid in gold.
//
// It sits under the last stretch of sea, with Dubai exactly where the route across the water ends.
// As the camera climbs through the haze, dust settles onto the continents and the routes run out
// from the hub. From there the camera stays put and the globe turns to each region.

import * as THREE from "three";
import routes from "@/components/globe/routes.json";
import { FINISH, NOISE } from "./glsl";
import { WORLD, regionAt } from "./journey";
import { PALETTE, type Quality } from "./kit";

const RAD = Math.PI / 180;
const R = WORLD.globeR;

const onGlobe = (lat: number, lon: number, r = 1) =>
  new THREE.Vector3(Math.cos(lat * RAD) * Math.sin(lon * RAD) * r, Math.sin(lat * RAD) * r, Math.cos(lat * RAD) * Math.cos(lon * RAD) * r);

export type Globe = {
  object: THREE.Group;
  /** pose = [lon, lat, distance]; scale = pixels per world unit at distance 1; viewPx = viewport height in pixels. */
  update: (pose: number[], body: number, form: number, arcs: number, t: number, dt: number, time: number, scale: number, viewPx: number) => void;
};

export async function buildGlobe(q: Quality): Promise<Globe> {
  const [landBuf, mask] = await Promise.all([
    fetch("/globe/land.bin").then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("land.bin")))),
    new THREE.TextureLoader().loadAsync("/globe/land-mask.png"),
  ]);
  mask.wrapS = THREE.RepeatWrapping;
  mask.minFilter = THREE.LinearFilter;
  mask.generateMipmaps = false;

  // The pivot stands the globe's "towards the viewer" axis upright, because the camera looks down
  // on it; the inner group then turns the wanted longitude and latitude to face it, north up.
  const pivot = new THREE.Group();
  pivot.position.set(WORLD.hub[0], WORLD.hub[1] - R, WORLD.hub[2]);
  pivot.rotation.x = -Math.PI / 2;
  pivot.scale.setScalar(R);
  const globe = new THREE.Group();
  pivot.add(globe);

  const shared = {
    uScale: { value: 1 },
    uView: { value: 800 },
    uTime: { value: 0 },
    uDraw: { value: 0 },
    uBody: { value: 0 },
    uDim: { value: new THREE.Vector3(1, 1, 1) }, // brightness of each region's routes
    uHaze: { value: new THREE.Color(PALETTE.haze) },
  };

  // Body: stone sphere, continents in relief.
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(1, q.small ? 64 : 128, q.small ? 40 : 80),
    new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uMask: { value: mask },
        uLand: { value: new THREE.Color("#e4d9c2") },
        uLandDark: { value: new THREE.Color("#cdb893") },
        uSea: { value: new THREE.Color("#aab4b8") },
        uSeaDeep: { value: new THREE.Color("#8d999f") },
        uEdge: { value: new THREE.Color("#7f6a4c") },
      },
      defines: { FBM_OCTAVES: 3 },
      transparent: true,
      vertexShader: /* glsl */ `
        varying vec3 vObj;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vObj = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform mat3 normalMatrix;
        uniform sampler2D uMask;
        uniform vec3 uLand;
        uniform vec3 uLandDark;
        uniform vec3 uSea;
        uniform vec3 uSeaDeep;
        uniform vec3 uEdge;
        uniform vec3 uHaze;
        uniform float uBody;
        ${NOISE}
        varying vec3 vObj;
        varying vec3 vN;
        varying vec3 vV;
        const vec3 LIGHT = vec3(-0.46, 0.58, 0.67); // view space: over the viewer's left shoulder
        void main() {
          vec3 p = normalize(vObj);
          float lon = atan(p.x, p.z);
          float lat = asin(clamp(p.y, -1.0, 1.0));
          vec2 uv = vec2(lon / 6.28318 + 0.5, lat / 3.14159 + 0.5);
          vec2 e = vec2(1.6 / 2048.0, 1.6 / 1024.0);
          float m = texture2D(uMask, uv).r;
          float mx = texture2D(uMask, uv + vec2(e.x, 0.0)).r - texture2D(uMask, uv - vec2(e.x, 0.0)).r;
          float my = texture2D(uMask, uv + vec2(0.0, e.y)).r - texture2D(uMask, uv - vec2(0.0, e.y)).r;
          float land = smoothstep(0.44, 0.56, m);

          // Bevel the coast: tilt the normal down the mask's slope, in the local east/north frame.
          vec3 east = normalize(vec3(p.z, 0.0, -p.x));
          vec3 north = cross(p, east);
          vec3 tilt = (east * mx / max(cos(lat), 0.2) + north * my) * 2.6;
          vec3 n = normalize(normalMatrix * normalize(p - tilt));
          vec3 ns = normalize(vN);

          float grain = fbm(p * 34.0);
          float broad = fbm(p * 5.0 + 3.0);
          vec3 landCol = mix(uLand, uLandDark, smoothstep(0.3, 0.75, broad)) * (0.92 + 0.16 * grain);
          vec3 seaCol = mix(uSea, uSeaDeep, smoothstep(0.35, 0.8, broad)) * (0.96 + 0.08 * grain);
          // The land casts a short shadow onto the sea on the side away from the light.
          vec3 lightObj = normalize(LIGHT * mat3(normalMatrix));
          vec2 toLight = vec2(dot(lightObj, east) / max(cos(lat), 0.2), dot(lightObj, north)) * e * 2.4;
          float shade = smoothstep(0.3, 0.7, texture2D(uMask, uv + toLight).r) * (1.0 - land);
          seaCol *= 1.0 - 0.2 * shade;
          vec3 col = mix(seaCol, landCol, land);
          col = mix(col, uEdge, smoothstep(0.07, 0.0, abs(m - 0.5)) * 0.4);

          // Graticule, engraved every 15 degrees.
          vec2 g = vec2(lon, lat) / 0.261799;
          vec2 gl = abs(fract(g - 0.5) - 0.5) / fwidth(g);
          col *= 1.0 - 0.1 * (1.0 - min(min(gl.x, gl.y), 1.0)) * (1.0 - land * 0.5);

          float diff = max(dot(n, LIGHT), 0.0);
          float wrap = dot(ns, LIGHT) * 0.5 + 0.5;
          col *= 0.5 + 0.34 * wrap + 0.42 * diff;
          // The limb dissolves into the haze the globe hangs in.
          float rim = pow(1.0 - max(dot(ns, normalize(vV)), 0.0), 2.4);
          col = mix(col, uHaze, rim * 0.72);
          gl_FragColor = vec4(col, uBody);
          ${FINISH}
        }`,
    }),
  );
  body.renderOrder = 1;
  globe.add(body);

  // A soft, warm fall-off around the limb: the globe's own air.
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 48, 32),
    new THREE.ShaderMaterial({
      uniforms: { ...shared, uTint: { value: new THREE.Color("#bfa77f") } },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint;
        uniform float uBody;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float f = pow(max(dot(normalize(-vN), normalize(vV)), 0.0), 3.4);
          gl_FragColor = vec4(uTint, f * 0.34 * uBody);
          ${FINISH}
        }`,
    }),
  );
  halo.renderOrder = 0;
  globe.add(halo);

  // Land grains. Each starts as dust in the air above its place on the map and settles onto it:
  // this is the moment the physical world becomes the map of it.
  const land = new Int16Array(landBuf);
  const landCount = land.length / 2;
  const to = new Float32Array(landCount * 3);
  const rnd = new Float32Array(landCount * 3);
  let seed = 5;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < landCount; i++) {
    onGlobe(land[i * 2] / 100, land[i * 2 + 1] / 100, 1.003).toArray(to, i * 3);
    rnd[i * 3] = rand();
    rnd[i * 3 + 1] = rand();
    rnd[i * 3 + 2] = rand();
  }
  const grainGeo = new THREE.BufferGeometry();
  grainGeo.setAttribute("position", new THREE.BufferAttribute(to, 3));
  grainGeo.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 3));
  // The file is pre-shuffled, so drawing fewer is an even thinning.
  grainGeo.setDrawRange(0, q.small ? Math.floor(landCount * 0.55) : landCount);
  const grainUniforms = { ...shared, uForm: { value: 0 }, uColor: { value: new THREE.Color("#8d7758") } };
  const grains = new THREE.Points(
    grainGeo,
    new THREE.ShaderMaterial({
      uniforms: grainUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uScale;
        uniform float uView;
        uniform float uForm;
        attribute vec3 aRnd;
        varying float vA;
        void main() {
          // Each grain has its own start time, so the cloud thins from one side to the other.
          float k = clamp((uForm - aRnd.x * 0.55) / 0.45, 0.0, 1.0);
          float e = 1.0 - pow(1.0 - k, 3.0);
          // Its place in the air: lifted off the surface and swung round the axis through the map.
          float lift = (0.1 + aRnd.y * 0.5) * (1.0 - e);
          float swing = (aRnd.z - 0.5) * 1.6 * (1.0 - e);
          float c = cos(swing);
          float s = sin(swing);
          vec3 p = vec3(position.x * c - position.z * s, position.y + (aRnd.x - 0.5) * 0.3 * (1.0 - e), position.x * s + position.z * c);
          p = normalize(p) * (1.003 + lift);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp((0.0046 + 0.014 * (1.0 - e)) * ${R.toFixed(1)} * uScale / -mv.z, 1.2, uView * 0.012);
          vA = smoothstep(0.0, 0.12, k) * mix(0.75, 0.34, e);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(uColor, smoothstep(0.5, 0.3, d) * vA);
          ${FINISH}
        }`,
    }),
  );
  grains.renderOrder = 2;
  grains.frustumCulled = false;
  globe.add(grains);

  // Routes: great-circle arcs from the hub, lifted off the surface in proportion to their length.
  const hub = onGlobe(routes.hub.lat, routes.hub.lon);
  const SEG = q.small ? 40 : 64;
  const headFrom: number[] = [];
  const headTo: number[] = [];
  const headMeta: number[] = []; // angle, phase, region
  const markPos: number[] = [];
  const markSize: number[] = [];
  const markRegion: number[] = [];
  const lift = (angle: number) => 0.03 + 0.26 * angle;
  const arcPoint = (dest: THREE.Vector3, angle: number, t: number) => {
    const k0 = Math.sin((1 - t) * angle) / Math.sin(angle);
    const k1 = Math.sin(t * angle) / Math.sin(angle);
    return hub
      .clone()
      .multiplyScalar(k0)
      .addScaledVector(dest, k1)
      .normalize()
      .multiplyScalar(1 + lift(angle) * Math.sin(Math.PI * t));
  };
  const f32 = (a: number[], n: number) => new THREE.BufferAttribute(new Float32Array(a), n);
  const DIM = /* glsl */ `
    uniform vec3 uDim;
    float regionDim(float region) {
      return region < -0.5 ? 1.0 : (region < 0.5 ? uDim.x : (region < 1.5 ? uDim.y : uDim.z));
    }
  `;
  const arcMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uColor: { value: new THREE.Color(PALETTE.gold) }, uHot: { value: new THREE.Color("#fff0cb") } },
    transparent: true,
    depthWrite: false,
    defines: { ARC_RADIUS: "0.0034" },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uScale;
      ${DIM}
      attribute float aRegion;
      attribute float aPhase;
      varying float vGlow;
      varying float vDim;
      varying float vT;
      void main() {
        vT = uv.x;
        // The inlay keeps one width on screen, about 2.6 px, however close the camera comes.
        vec3 centre = position - normal * ARC_RADIUS;
        float depth = -(modelViewMatrix * vec4(centre, 1.0)).z;
        vec3 placed = centre + normal * (1.3 * depth / uScale / ${R.toFixed(1)});
        // A pulse travels hub -> market along every route.
        float behind = fract(uTime * 0.16 + aPhase) - uv.x;
        vGlow = behind > 0.0 ? exp(-behind * 7.0) : 0.0;
        vDim = regionDim(aRegion);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(placed, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uHot;
      uniform float uDraw;
      uniform float uBody;
      varying float vGlow;
      varying float vDim;
      varying float vT;
      void main() {
        if (vT > uDraw) discard;
        gl_FragColor = vec4(mix(uColor * 0.92, uHot, vGlow * 0.7), mix(0.14, 1.0, vDim) * uBody);
        ${FINISH}
      }`,
  });
  routes.markets.forEach((mkt, i) => {
    const dest = onGlobe(mkt.lat, mkt.lon);
    const angle = hub.angleTo(dest);
    const phase = (i * 0.37) % 1;
    const pts = Array.from({ length: SEG + 1 }, (_, s) => arcPoint(dest, angle, s / SEG));
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), SEG, 0.0034, 5);
    const n = tube.attributes.position.count;
    tube.setAttribute("aRegion", f32(new Array(n).fill(mkt.region), 1));
    tube.setAttribute("aPhase", f32(new Array(n).fill(phase), 1));
    const arc = new THREE.Mesh(tube, arcMat);
    arc.renderOrder = 3;
    globe.add(arc);
    hub.toArray(headFrom, headFrom.length);
    dest.toArray(headTo, headTo.length);
    headMeta.push(angle, phase, mkt.region);
    dest.clone().multiplyScalar(1.005).toArray(markPos, markPos.length);
    markSize.push(0.05);
    markRegion.push(mkt.region);
  });
  hub.clone().multiplyScalar(1.005).toArray(markPos, markPos.length);
  markSize.push(0.1);
  markRegion.push(-1);

  // Route heads: one bright point per arc, moved along it in the vertex shader.
  const headGeo = new THREE.BufferGeometry();
  headGeo.setAttribute("position", f32(headFrom, 3));
  headGeo.setAttribute("aTo", f32(headTo, 3));
  headGeo.setAttribute("aMeta", f32(headMeta, 3));
  const heads = new THREE.Points(
    headGeo,
    new THREE.ShaderMaterial({
      uniforms: { ...shared, uColor: { value: new THREE.Color("#fff3d2") }, uGold: { value: new THREE.Color(PALETTE.gold) } },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uScale;
        uniform float uView;
        uniform float uTime;
        uniform float uDraw;
        ${DIM}
        attribute vec3 aTo;
        attribute vec3 aMeta;
        varying float vA;
        void main() {
          float t = fract(uTime * 0.16 + aMeta.y);
          float k0 = sin((1.0 - t) * aMeta.x) / sin(aMeta.x);
          float k1 = sin(t * aMeta.x) / sin(aMeta.x);
          vec3 p = normalize(position * k0 + aTo * k1) * (1.0 + (0.03 + 0.26 * aMeta.x) * sin(3.14159265 * t));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = step(0.5, regionDim(aMeta.z)) * smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.9, t) * step(0.999, uDraw);
          gl_PointSize = min(0.03 * ${R.toFixed(1)} * uScale / -mv.z, uView * 0.022);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uGold;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          gl_FragColor = vec4(mix(uGold, uColor, smoothstep(0.7, 0.1, d)), smoothstep(1.0, 0.55, d) * vA);
          ${FINISH}
        }`,
    }),
  );
  heads.frustumCulled = false;
  heads.renderOrder = 4;
  globe.add(heads);

  // Market markers, with a ring that breathes outward. The hub is the charcoal one.
  const markGeo = new THREE.BufferGeometry();
  markGeo.setAttribute("position", f32(markPos, 3));
  markGeo.setAttribute("aSize", f32(markSize, 1));
  markGeo.setAttribute("aRegion", f32(markRegion, 1));
  const marks = new THREE.Points(
    markGeo,
    new THREE.ShaderMaterial({
      uniforms: { ...shared, uColor: { value: new THREE.Color("#a98738") }, uHub: { value: new THREE.Color(PALETTE.charcoal) } },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uScale;
        uniform float uView;
        uniform float uDraw;
        ${DIM}
        attribute float aSize;
        attribute float aRegion;
        varying float vDim;
        varying float vHub;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vHub = aRegion < -0.5 ? 1.0 : 0.0;
          // Markets appear as their route reaches them; the hub is there from the start.
          vDim = mix(0.2, 1.0, regionDim(aRegion)) * max(vHub, smoothstep(0.75, 1.0, uDraw));
          gl_PointSize = min(aSize * ${R.toFixed(1)} * uScale / -mv.z, uView * (0.034 + 0.03 * vHub));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uHub;
        uniform float uTime;
        uniform float uBody;
        varying float vDim;
        varying float vHub;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float core = smoothstep(0.34, 0.24, d);
          float r = 0.4 + 0.6 * fract(uTime * 0.4 + vHub * 0.5);
          float ring = smoothstep(0.09, 0.0, abs(d - r)) * (1.0 - smoothstep(0.4, 1.0, r));
          gl_FragColor = vec4(mix(uColor, uHub, vHub * core), max(core, ring * 0.85) * vDim * uBody);
          ${FINISH}
        }`,
    }),
  );
  marks.frustumCulled = false;
  marks.renderOrder = 5;
  globe.add(marks);

  const dim = shared.uDim.value;
  return {
    object: pivot,
    update(pose, bodyAlpha, form, arcs, t, dt, time, scale, viewPx) {
      globe.rotation.set(pose[1] * RAD, -pose[0] * RAD, 0);
      shared.uScale.value = scale;
      shared.uView.value = viewPx;
      shared.uTime.value = time;
      shared.uBody.value = bodyAlpha;
      shared.uDraw.value = arcs;
      grainUniforms.uForm.value = form;
      // Ease each region's routes up or down as the copy moves between regions.
      const focus = regionAt(t);
      const k = 1 - Math.exp(-4 * dt);
      dim.x += ((focus < 0 || focus === 0 ? 1 : 0) - dim.x) * k;
      dim.y += ((focus < 0 || focus === 1 ? 1 : 0) - dim.y) * k;
      dim.z += ((focus < 0 || focus === 2 ? 1 : 0) - dim.z) * k;
    },
  };
}
