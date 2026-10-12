// The world's renderer. One scene, one camera, one sun. The page hands it a journey time each
// frame; everything on screen is a function of that number, so scrubbing back is exact.
//
// Scenes are built in stages after the first frame is up, and each is only drawn while the journey
// is near it.

import * as THREE from "three";
import { buildCommodities } from "./commodities";
import { buildGlobe } from "./globe";
import { type Frame, TALL_LAYOUT, WORLD, at, buildTracks, evaluate, fovFor, makeFrame, shipX } from "./journey";
import { PALETTE, type Quality, air } from "./kit";
import { buildLandscape, buildSky } from "./landscape";
import { clamp, mix, sstep } from "./math";
import { buildOcean } from "./ocean";
import { buildPort, buildShip } from "./port";
import { buildDust, buildRoute } from "./route";
import { buildWarehouse } from "./warehouse";

export type SceneContext = {
  t: number;
  dt: number;
  time: number;
  frame: Frame;
  camera: THREE.PerspectiveCamera;
};

export type ScenePart = {
  object: THREE.Object3D;
  /** Journey times between which this part is drawn. */
  range: readonly [number, number];
  update?: (c: SceneContext) => void;
};

export type World = {
  /** Render the world at journey time t. */
  frame: (dt: number, t: number) => void;
  resize: () => void;
  /** Step quality down once. Returns false when there is nothing left to give up. */
  degrade: () => boolean;
  dispose: () => void;
  canvas: HTMLCanvasElement;
  /** Resolves when every scene is built and its shaders are compiled. */
  ready: Promise<void>;
};

const RAD = Math.PI / 180;
/** Yield to the browser for a frame or two between pieces of loading work. */
const breathe = () => new Promise<void>((r) => setTimeout(r, 40));

export function createWorld(host: HTMLElement, q: Quality): World {
  const renderer = new THREE.WebGLRenderer({ antialias: !q.small, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = !q.small;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  let dpr = Math.min(window.devicePixelRatio || 1, q.small ? 1.25 : 1.5);

  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(PALETTE.haze, 0.001);
  scene.fog = fog;
  scene.background = new THREE.Color(PALETTE.haze);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.6, 9000);

  // Light: a low sun ahead and to the right of the line of travel, and the sky's bounce.
  scene.add(new THREE.HemisphereLight("#f4eee2", "#cdb898", 1.95));
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.7);
  sun.castShadow = !q.small;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 2400;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const sunDir = air.uSunDir.value;
  const lightRight = new THREE.Vector3(0, 1, 0).cross(sunDir).normalize();
  const lightUp = new THREE.Vector3().crossVectors(sunDir, lightRight);

  const parts: ScenePart[] = [];
  const add = (p: ScenePart) => {
    scene.add(p.object);
    parts.push(p);
    return p;
  };

  const sky = buildSky(8200);
  add({ object: sky, range: [-9, 99], update: (c) => sky.position.copy(c.camera.position) });
  add({ object: buildLandscape(q), range: [-9, at("strength.c", 0.6)] });
  const route = buildRoute();
  add({ object: route.object, range: [-9, at("markets.intro", 0.4)] });
  const dust = buildDust(q);
  add({ object: dust.object, range: [-9, at("markets.intro", 0.7)] });

  // The remaining scenes arrive in stages so no single task blocks the main thread for long.
  let disposed = false;
  let px = 0.001; // world units per pixel at distance 1
  let pointScale = 1; // pixels per world unit at distance 1
  const ready = (async () => {
    const stages: (() => void | Promise<void>)[] = [
      () => {
        const c = buildCommodities(q);
        add({ object: c.heaps, range: [-9, at("strength.a", 0.4)] });
        add({ object: c.lumps, range: [at("about.b", 0.4), at("strength.a", 0.3)] });
      },
      () => void add({ object: buildWarehouse(q), range: [-9, at("strength.c", 0.5)] }),
      () => void add({ object: buildPort(), range: [-9, at("visionary.a", 0.6)] }),
      () => {
        const ship = buildShip();
        add({
          object: ship,
          range: [-9, at("vision", 0.76)],
          update: (c) => {
            // A ship this size barely answers the swell: a slow, shallow heave and pitch.
            ship.position.set(shipX(c.frame.shipZ), Math.sin(c.time * 0.5) * 0.18, c.frame.shipZ);
            ship.rotation.x = Math.sin(c.time * 0.37) * 0.004;
          },
        });
      },
      () => {
        const ocean = buildOcean(q);
        ocean.object.renderOrder = 2; // after the land, so the land's depth saves the sea's shading
        add({
          object: ocean.object,
          range: [-9, at("vision", 0.78)],
          update: (c) => ocean.update(c.camera, shipX(c.frame.shipZ), c.frame.shipZ, c.frame.shipSpeed, px),
        });
      },
      async () => {
        const globe = await buildGlobe(q);
        add({
          object: globe.object,
          range: [at("vision", 0.68), 99],
          update: (c) => globe.update(c.frame.globe, c.frame.globeBody, c.frame.globeForm, c.frame.globeArcs, c.t, c.dt, c.time, pointScale, h * dpr),
        });
      },
    ];
    // Each scene is built, compiled and drawn once into a throwaway target before the next one
    // starts. That puts its buffers, textures and shaders on the GPU while the reader is still on
    // the first screens, in small steps, instead of as one stall when the scene scrolls into view.
    const warm = new THREE.WebGLRenderTarget(8, 8);
    for (const stage of stages) {
      await breathe();
      if (disposed) break;
      const before = parts.length;
      await stage();
      if (disposed) break;
      const fresh = parts.slice(before).map((p) => p.object);
      for (const object of fresh) await renderer.compileAsync(object, camera, scene);
      if (disposed) break;
      await breathe();
      const culled: THREE.Object3D[] = [];
      parts.forEach((p) => (p.object.visible = fresh.includes(p.object)));
      fresh.forEach((object) =>
        object.traverse((o) => {
          if (o.frustumCulled) {
            o.frustumCulled = false;
            culled.push(o);
          }
        }),
      );
      renderer.setRenderTarget(warm);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      culled.forEach((o) => (o.frustumCulled = true));
      // Visibility is put back by the next frame, which sets it from each part's range.
    }
    warm.dispose();
  })();

  // ── Frame ──────────────────────────────────────────────────────────────────
  let tracks = buildTracks(1);
  let w = 1;
  let h = 1;
  let time = 0;
  let intro = 0;
  const F = makeFrame();
  const ctx: SceneContext = { t: 0, dt: 0, time: 0, frame: F, camera };
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const upHint = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const back = new THREE.Vector3();
  const right = new THREE.Vector3();
  const upv = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const focus = new THREE.Vector3();
  const hub = new THREE.Vector3(...WORLD.hub);
  const globeCentre = new THREE.Vector3(hub.x, hub.y - WORLD.globeR, hub.z);
  const overGlobe = new THREE.Vector3();

  const resize = () => {
    w = Math.max(1, host.clientWidth);
    h = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = fovFor(camera.aspect);
    // Framed for the layout the stylesheet is actually using.
    tracks = buildTracks(camera.aspect, !window.matchMedia(TALL_LAYOUT).matches);
    const tanHalf = Math.tan((camera.fov / 2) * RAD);
    px = (2 * tanHalf) / h;
    pointScale = (h * dpr * 0.5) / tanHalf;
  };
  resize();

  const frame = (dt: number, t: number) => {
    time += dt;
    intro = Math.min(1, intro + dt / 2.6);
    evaluate(tracks, t, F);
    ctx.t = t;
    ctx.dt = dt;
    ctx.time = time;
    air.uTime.value = time;

    // Camera: the flown path, handing over to a station above the globe at the end of the climb.
    pos.fromArray(F.pos);
    look.fromArray(F.look);
    if (F.rig > 0) {
      overGlobe.set(hub.x, globeCentre.y + F.globe[2] * WORLD.globeR, hub.z);
      pos.lerp(overGlobe, F.rig);
      look.lerp(globeCentre, F.rig);
    }
    upHint.fromArray(F.up).normalize();
    fwd.subVectors(look, pos).normalize();
    right.crossVectors(fwd, upHint).normalize();
    upv.crossVectors(right, fwd);
    camera.position.copy(pos);
    camera.quaternion.setFromRotationMatrix(basis.makeBasis(right, upv, back.copy(fwd).negate()));
    camera.near = mix(0.6, 40, sstep(80, 1100, pos.y));
    // Shift the picture without turning the camera, so the horizon stays level beside the copy.
    camera.setViewOffset(w, h, (-F.shift[0] * w) / 2, (F.shift[1] * h) / 2, w, h);
    camera.updateMatrixWorld();

    fog.density = F.fog;
    air.uFogDensity.value = F.fog;

    // Sun shadow: an orthographic box that follows the camera, snapped to its own texels so the
    // shadow edges do not crawl while the camera travels.
    if (sun.castShadow) {
      const size = Math.ceil(F.shadow / 40) * 40;
      focus.copy(pos).addScaledVector(fwd, size * 0.6);
      focus.y = clamp(focus.y, 0, 60);
      const texel = (size * 2) / sun.shadow.mapSize.x;
      const fx = focus.dot(lightRight);
      const fy = focus.dot(lightUp);
      focus.addScaledVector(lightRight, Math.round(fx / texel) * texel - fx);
      focus.addScaledVector(lightUp, Math.round(fy / texel) * texel - fy);
      const cam = sun.shadow.camera;
      if (cam.right !== size) {
        cam.left = cam.bottom = -size;
        cam.right = cam.top = size;
        cam.updateProjectionMatrix();
        sun.shadow.normalBias = size * 0.0035;
      }
      sun.position.copy(focus).addScaledVector(sunDir, 1100);
      sun.target.position.copy(focus);
    }

    for (const p of parts) {
      const on = t >= p.range[0] && t <= p.range[1];
      p.object.visible = on;
      if (on) p.update?.(ctx);
    }
    // The line is drawn by scroll. On arrival it first runs out from behind the camera to meet it.
    const lag = 0.9 * (1 - intro * intro * (3 - 2 * intro));
    route.update(t - lag, t, px);
    dust.update(camera, F.dust, pointScale);

    if (shadowEvery > 1 && frameCount++ % shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  };

  // Quality steps, cheapest to lose first. Neither changes a shader: switching shadows off
  // outright would recompile every lit material mid-scroll, so the shadow map is refreshed less
  // often instead. A stale map still pairs with its own matrix, so the shadows stay in place.
  let shadowEvery = 1;
  let frameCount = 0;
  const degrade = () => {
    if (dpr > 1) {
      dpr = 1;
      resize();
      return true;
    }
    if (sun.castShadow && shadowEvery === 1) {
      shadowEvery = 3;
      renderer.shadowMap.autoUpdate = false;
      return true;
    }
    return false;
  };

  const dispose = () => {
    disposed = true;
    scene.traverse((o) => {
      const m = o as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
      m.geometry?.dispose();
      if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
      else m.material?.dispose();
    });
    sun.shadow.map?.dispose();
    renderer.dispose();
    canvas.remove();
  };

  return { frame, resize, degrade, dispose, canvas, ready };
}
