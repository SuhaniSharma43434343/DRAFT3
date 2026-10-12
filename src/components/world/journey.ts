// The journey: one continuous camera move through one physical world, scored against the page.
//
// The page is a column of "beats" (see <Beat> in app/page.tsx). Journey time `t` is the beat index
// plus how far the reader has scrolled through that beat, so every key below is written against the
// copy it plays under, and stays in step with it at any viewport size.
//
// The world runs down the -Z axis, in metres: a plain of rock formations, a canyon, a quarry basin
// of stockpiles, a warehouse, a jetty with a bulk carrier, open sea, and finally the globe.

import { type Key, type Mode, sample, sstep } from "./math";

export const BEATS = [
  { key: "hero", span: 1.3 },
  { key: "about.a", span: 1.5 },
  { key: "about.b", span: 1.6 },
  { key: "products", span: 5.2 },
  { key: "strength.a", span: 1.6 },
  { key: "strength.b", span: 1.5 },
  { key: "strength.c", span: 1.8 },
  { key: "visionary.a", span: 1.6 },
  { key: "visionary.b", span: 1.5 },
  { key: "vision", span: 1.7 },
  { key: "markets.intro", span: 1.6 },
  { key: "markets.0", span: 1.3 },
  { key: "markets.1", span: 1.3 },
  { key: "markets.2", span: 1.4 },
  { key: "ahead.a", span: 1.4 },
  { key: "ahead.b", span: 1.5 },
] as const;

export type BeatKey = (typeof BEATS)[number]["key"];
const INDEX = new Map<string, number>(BEATS.map((b, i) => [b.key, i]));

/** Journey time `f` of the way through a beat's whole scroll length. */
export const at = (key: BeatKey, f = 0) => INDEX.get(key)! + f;
/** Journey time `p` of the way through a beat's hold: the stretch where its copy stands still. */
export const pin = (key: BeatKey, p = 0) => {
  const i = INDEX.get(key)!;
  return i + p * (1 - 1 / BEATS[i].span);
};
export const spanOf = (key: BeatKey) => BEATS[INDEX.get(key)!].span;
/** Journey time at the top of the enquiry section, where the beats end. */
export const END = BEATS.length;

export const PRODUCT_STEPS = 6;

export const WORLD = {
  floor: 6, // ground level of the canyon, yard and jetty deck; the sea is y = 0
  stationZ: (k: number) => -215 - k * 62, // the six product stations in the quarry basin
  hall: { z0: -620, z1: -860, half: 42, eave: 22, ridge: 31, door: 19 },
  coast: -900,
  jetty: { z0: -892, z1: -1262, half: 12 },
  ship: { x: 31, z: -1075, length: 225, beam: 32 },
  hub: [0, 0, -2950] as const, // where the route meets the globe: Dubai sits exactly here
  globeR: 1200,
} as const;

/** The stylesheet's tall layout (copy under the picture). One definition for the CSS media query's twin, the driver and the camera. */
export const TALL_LAYOUT = "(max-width: 559px), (max-aspect-ratio: 1/1)";

/** Vertical field of view. Portrait screens get a wider one so scenes are not cropped to a slit. */
export const fovFor = (aspect: number) => (aspect >= 1 ? 40 : 56);

// ── Tracks ───────────────────────────────────────────────────────────────────

type Track = { keys: Key[]; mode: Mode };
const track = (mode: Mode, keys: Key[]): Track => ({ keys, mode });

export type Tracks = ReturnType<typeof buildTracks>;

/** `wide` = copy beside the picture (landscape); otherwise copy beneath it. */
export function buildTracks(aspect: number, wide = aspect >= 1) {
  const station = (k: number) => pin("products", (k + 0.5) / PRODUCT_STEPS);
  const sz = WORLD.stationZ;

  // Camera position and the point it looks at. One spline each, sampled at the same damped time,
  // so the two can never drift apart and shake the frame.
  // prettier-ignore
  const cam: Key[] = [
    //  t                         position                look-at
    [at("hero"),                   60, 300,   560,          0,  70,  -420],
    [at("hero", 0.55),             44, 262,   450,          0,  50,  -300],
    [at("about.a"),                22, 170,   330,          0,  30,  -120],
    [at("about.a", 0.5),            4,  84,   210,          2,  22,   -80],
    [at("about.b"),                -8,  40,    90,          4,  20,  -140],
    [at("about.b", 0.5),            4,  21,   -20,          0,  16,  -200],
    [at("about.b", 0.85),           2,  17,  -105,        -10,  12,  -260],
    [at("products"),              -10,  17,  -150,         30,   9,  -250],
    [station(0),                  -14,  12, sz(0) + 42,    36,   8, sz(0) - 12],
    [station(1),                   -9,  10, sz(1) + 38,    38,   9, sz(1) - 14],
    [station(2),                  -15,  13, sz(2) + 44,    36,   8, sz(2) - 12],
    [station(3),                  -10,  15, sz(3) + 46,    40,  11, sz(3) - 16],
    [station(4),                  -14,  11, sz(4) + 40,    36,   8, sz(4) - 12],
    [station(5),                  -10,  12, sz(5) + 42,    36,   7, sz(5) - 12],
    [pin("products", 1),           -4,  13,  -560,          0,  14,  -700],
    [at("strength.a"),              0,  12,  -606,          0,  13,  -760],
    [at("strength.a", 0.5),        -5,  14,  -680,          8,  11,  -840],
    [at("strength.b"),              5,  15,  -750,         -2,  11,  -900],
    [at("strength.b", 0.55),        0,  12,  -836,          0,  12, -1000],
    [at("strength.c"),            -34,  30,  -905,         22,  14, -1050],
    [at("strength.c", 0.45),     -118,  44,  -975,         30,  15, -1085],
    [at("strength.c", 0.8),       -96,  50, -1020,         28,  14, -1150],
    [at("visionary.a"),           -52,  50, -1060,         18,  12, -1270],
    [at("visionary.a", 0.5),      -74,  46, -1372,         10,  10, -1640],
    [at("visionary.b"),           -64,  30, -1800,          6,  12, -2030],
    [at("visionary.b", 0.5),      -58,  60, -2190,          4,   8, -2450],
    [at("vision"),                  0, 230, -2430,          0,   0, -2800],
    [at("vision", 0.35),            0, 560, -2650,          0,   0, -2900],
    [at("vision", 0.7),             0, 1000, -2885,         0,   0, -2950],
  ];

  // Which way is "up" for the camera. Level flight until the climb, then it tips forward so the
  // camera can look straight down without the horizon rolling.
  const up = track("smooth", [
    [at("vision"), 0, 1, 0],
    [at("vision", 0.35), 0, 0.7, -0.7],
    [at("vision", 0.7), 0, 0, -1],
  ]);

  // Globe poses: longitude and latitude under the camera, and `fill`, the globe's radius as a share
  // of the viewport's shorter half-side. Each pose holds while its copy is pinned.
  const half = Math.tan((fovFor(aspect) / 2) * (Math.PI / 180)) * Math.min(aspect, 1);
  const handoff = 1 + 1000 / WORLD.globeR; // camera distance from the globe centre as the climb ends
  const pose = (key: BeatKey, lon: number, lat: number, fill: number): Key[] => [
    [pin(key, 0), lon, lat, 1 / (half * fill)],
    [pin(key, 1), lon, lat, 1 / (half * fill)],
  ];
  const globe = track("smooth", [
    [at("vision", 0.7), 55.27, 25.2, handoff],
    ...pose("markets.intro", 42, 16, wide ? 0.86 : 1.0),
    ...pose("markets.0", 50, 26, wide ? 1.6 : 1.9),
    ...pose("markets.1", 76, 18, wide ? 1.5 : 1.8),
    ...pose("markets.2", wide ? 4 : 14, wide ? 13 : 14, wide ? 1.35 : 1.5),
    ...pose("ahead.a", 34, 14, wide ? 0.82 : 0.95),
    ...pose("ahead.b", 30, 20, wide ? 1.25 : 1.3),
    [END, 30, 28, 1 / (half * (wide ? 2.2 : 2.0))],
  ]);

  // Where the subject sits on screen, -1..1 of the half-frame. The copy takes the left of a wide
  // screen and the bottom of a tall one, so the picture is pushed the other way.
  const S = (x: number, y = 0): [number, number] => (wide ? [x, y] : [0, 0.24 + y * 0.5]);
  const shift = track("smooth", [
    [at("hero"), ...S(0.18)],
    [at("about.a"), ...S(0.2)],
    [at("products"), ...S(0.3)],
    [pin("products", 1), ...S(0.26)],
    [at("strength.a"), ...S(0.14)],
    [at("strength.b", 0.55), ...S(0.1)],
    [at("strength.c", 0.45), ...S(0.26)],
    [at("visionary.b"), ...S(0.24)],
    [at("vision"), ...S(0.22)],
    [at("vision", 0.7), ...S(0.3)],
    [pin("markets.intro", 0), ...(wide ? [0.5, 0] : [0, 0.42])],
    [pin("markets.2", 1), ...(wide ? [0.5, 0] : [0, 0.42])],
    [pin("ahead.a", 0), ...(wide ? [0.46, 0] : [0, 0.4])],
    [pin("ahead.a", 1), ...(wide ? [0.46, 0] : [0, 0.4])],
    [pin("ahead.b", 0), ...(wide ? [0.56, -0.3] : [0, 0.1])],
    [pin("ahead.b", 1), ...(wide ? [0.5, -0.6] : [0, -0.3])],
    [END, ...(wide ? [0, -1.5] : [0, -1.3])],
  ]);

  return {
    wide,
    cam: track("spline", cam),
    up,
    globe,
    shift,
    // 0 = the camera flies the path above; 1 = it hangs over the globe.
    rig: track("smooth", [
      [at("vision", 0.7), 0],
      [at("vision", 0.95), 1],
    ]),
    // Haze (exponential-squared fog density). The climb ends in a white-out that hides the world
    // while the globe forms underneath.
    fog: track("smooth", [
      [at("hero"), 0.00105],
      [at("about.a", 0.3), 0.0013],
      [at("about.b"), 0.0021],
      [at("products"), 0.0023],
      [at("strength.a"), 0.003],
      [at("strength.b", 0.55), 0.003],
      [at("strength.c", 0.1), 0.0015],
      [at("visionary.b"), 0.0011],
      [at("vision"), 0.0011],
      [at("vision", 0.35), 0.002],
      [at("vision", 0.68), 0.006],
    ]),
    // Half-width of the sun's shadow frustum: it follows the camera and widens with altitude.
    shadow: track("smooth", [
      [at("hero"), 560],
      [at("about.a", 0.3), 420],
      [at("about.b"), 190],
      [at("products"), 150],
      [at("strength.a"), 120],
      [at("strength.b", 0.8), 120],
      [at("strength.c", 0.3), 260],
      [at("visionary.a", 0.5), 240],
      [at("vision"), 320],
    ]),
    dust: track("smooth", [
      [at("hero"), 0.22],
      [at("about.b"), 0.6],
      [at("strength.a"), 1],
      [at("strength.c"), 0.5],
      [at("visionary.b"), 0.32],
      [at("vision", 0.3), 0.85],
      [at("markets.intro"), 0.5],
      [at("markets.intro", 0.6), 0.12],
    ]),
    // The carrier: z along its course, and how hard it is steaming (drives the wake).
    shipZ: track("spline", [
      [at("strength.c", 0.55), WORLD.ship.z],
      [at("strength.c", 0.8), WORLD.ship.z - 45],
      [at("visionary.a"), -1250],
      [at("visionary.a", 0.5), -1600],
      [at("visionary.b"), -2000],
      [at("visionary.b", 0.5), -2400],
      [at("vision"), -2750],
      [at("vision", 0.8), -3200],
    ]),
    shipSpeed: track("smooth", [
      [at("strength.c", 0.55), 0],
      [at("visionary.a"), 1],
    ]),
    // The globe arriving: its body out of the haze, the dust settling into land, the routes drawing.
    globeBody: track("smooth", [
      [at("vision", 0.72), 0],
      [at("markets.intro"), 1],
    ]),
    globeForm: track("linear", [
      [at("vision", 0.74), 0],
      [at("markets.intro", 0.3), 1],
    ]),
    globeArcs: track("linear", [
      [at("markets.intro"), 0],
      [at("markets.intro", 0.55), 1],
    ]),
  };
}

// The gold route: where its drawing head has reached, by journey time. It leads the camera, so the
// line is always seen running on ahead. Pairs are [z along the course, time the head arrives].
export const ROUTE_TIMING: readonly (readonly [number, number])[] = [
  [470, -0.9],
  [100, -0.3],
  [-150, 0],
  [-200, 1.4],
  [-290, 3],
  [-600, pin("products", 0.92)],
  [-720, 4],
  [-880, 5],
  [-960, 5.6],
  [-1100, 6],
  [-1262, 6.5],
  [-1700, 7],
  [-2060, 7.5],
  [-2480, 8],
  [-2820, 8.5],
  [-2950, 8.8],
];
/** After the globe has taken over, the route across the flat world lets go from its tail. */
export const ROUTE_RELEASE: readonly [number, number] = [at("vision", 0.85), at("markets.intro", 0.35)];

/** Which market region the globe is presenting at time t (-1 = all of them). */
export function regionAt(t: number): number {
  if (t < at("markets.intro", 0.75) || t >= at("markets.2", 0.8)) return -1;
  if (t < at("markets.0", 0.75)) return 0;
  if (t < at("markets.1", 0.75)) return 1;
  return 2;
}

/** The carrier leaves its berth beside the jetty and settles onto the route's centre line. */
export const shipX = (z: number) => WORLD.ship.x * (1 - sstep(-1300, -1700, z));

// ── Per-frame evaluation ─────────────────────────────────────────────────────

export type Frame = {
  pos: number[];
  look: number[];
  up: number[];
  globe: number[]; // lon, lat, distance in globe radii
  shift: number[];
  rig: number;
  fog: number;
  shadow: number;
  dust: number;
  shipZ: number;
  shipSpeed: number;
  globeBody: number;
  globeForm: number;
  globeArcs: number;
};

export const makeFrame = (): Frame => ({
  pos: [0, 0, 0],
  look: [0, 0, 0],
  up: [0, 1, 0],
  globe: [0, 0, 3],
  shift: [0, 0],
  rig: 0,
  fog: 0.001,
  shadow: 300,
  dust: 0,
  shipZ: WORLD.ship.z,
  shipSpeed: 0,
  globeBody: 0,
  globeForm: 0,
  globeArcs: 0,
});

const six: number[] = [];
const one: number[] = [];
const scalar = (tr: Track, t: number) => sample(tr.keys, t, tr.mode, one)[0];

export function evaluate(tr: Tracks, t: number, out: Frame): Frame {
  sample(tr.cam.keys, t, tr.cam.mode, six);
  out.pos[0] = six[0];
  out.pos[1] = six[1];
  out.pos[2] = six[2];
  out.look[0] = six[3];
  out.look[1] = six[4];
  out.look[2] = six[5];
  sample(tr.up.keys, t, tr.up.mode, out.up);
  sample(tr.globe.keys, t, tr.globe.mode, out.globe);
  sample(tr.shift.keys, t, tr.shift.mode, out.shift);
  out.rig = scalar(tr.rig, t);
  out.fog = scalar(tr.fog, t);
  out.shadow = scalar(tr.shadow, t);
  out.dust = scalar(tr.dust, t);
  out.shipZ = scalar(tr.shipZ, t);
  out.shipSpeed = scalar(tr.shipSpeed, t);
  out.globeBody = scalar(tr.globeBody, t);
  out.globeForm = scalar(tr.globeForm, t);
  out.globeArcs = scalar(tr.globeArcs, t);
  return out;
}
