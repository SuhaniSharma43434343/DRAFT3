// Builds the globe's static assets. Usage: node scripts/build-globe.mjs
//   public/globe/land.bin       Int16 pairs (lat*100, lon*100) of evenly spread dots that fall on land
//   public/globe/land-mask.png  equirectangular land mask, softened, that the stone globe's relief is cut from
// The globe's still for static mode is public/world/markets.webp, made by scripts/posters.mjs.
// Land outline: Natural Earth 1:50m (public domain) via the world-atlas package.
import fs from "node:fs";
import zlib from "node:zlib";
import { feature } from "topojson-client";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const topo = read("../node_modules/world-atlas/land-50m.json");
const land = feature(topo, topo.objects.land);

// Land mask, rasterised once and used for everything below.
// world-atlas stitches shapes across the antimeridian, so a ring's longitudes are first unwrapped
// into one continuous run (Eurasia runs past 180, Antarctica circles the pole and is closed through
// it). Each ring is scanline-filled with XOR, which makes holes (lakes) fall out by themselves, and
// spans are folded back onto the map modulo its width.
const geom = land.features ? land.features.flatMap((f) => f.geometry.coordinates) : land.geometry.coordinates;
const MW = 2048;
const MH = 1024;
const mask = new Uint8Array(MW * MH);
for (const rings of geom) {
  for (const ring of rings) {
    const pts = [[ring[0][0], ring[0][1]]];
    for (let i = 1; i < ring.length; i++) {
      let d = ring[i][0] - ring[i - 1][0];
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      pts.push([pts[i - 1][0] + d, ring[i][1]]);
    }
    const last = pts[pts.length - 1];
    if (Math.abs(last[0] - pts[0][0]) > 180) {
      const pole = ring.reduce((sum, c) => sum + c[1], 0) < 0 ? -90 : 90;
      pts.push([last[0], pole], [pts[0][0], pole], [pts[0][0], pts[0][1]]);
    }
    const rows = new Map();
    for (let i = 0; i < pts.length - 1; i++) {
      let x0 = ((pts[i][0] + 180) / 360) * MW;
      let y0 = ((90 - pts[i][1]) / 180) * MH;
      let x1 = ((pts[i + 1][0] + 180) / 360) * MW;
      let y1 = ((90 - pts[i + 1][1]) / 180) * MH;
      if (y0 === y1) continue;
      if (y0 > y1) [x0, y0, x1, y1] = [x1, y1, x0, y0];
      const ya = Math.max(0, Math.ceil(y0 - 0.5));
      const yb = Math.min(MH - 1, Math.ceil(y1 - 0.5) - 1);
      for (let y = ya; y <= yb; y++) {
        const t = (y + 0.5 - y0) / (y1 - y0);
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push(x0 + t * (x1 - x0));
      }
    }
    for (const [y, xs] of rows) {
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.ceil(xs[k] - 0.5);
        const b = Math.ceil(xs[k + 1] - 0.5) - 1;
        for (let x = a; x <= b; x++) mask[y * MW + (((x % MW) + MW) % MW)] ^= 255;
      }
    }
  }
}
const onLand = (lon, lat) => {
  const x = Math.min(MW - 1, Math.max(0, Math.floor(((lon + 180) / 360) * MW)));
  const y = Math.min(MH - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MH)));
  return mask[y * MW + x] > 0;
};

const N = 42000;
const golden = Math.PI * (3 - Math.sqrt(5));
const dots = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (2 * (i + 0.5)) / N;
  const lat = (Math.asin(y) * 180) / Math.PI;
  const lon = ((((i * golden * 180) / Math.PI) % 360) + 540) % 360 - 180;
  if (lat < -60) continue; // Antarctica adds dots nobody looks at
  if (onLand(lon, lat)) dots.push([lat, lon]);
}
// Shuffle so "the first n dots" is an even subsample (the phone tier draws fewer).
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let i = dots.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [dots[i], dots[j]] = [dots[j], dots[i]];
}
const bin = new Int16Array(dots.length * 2);
dots.forEach(([lat, lon], i) => {
  bin[i * 2] = Math.round(lat * 100);
  bin[i * 2 + 1] = Math.round(lon * 100);
});
fs.mkdirSync(new URL("../public/globe/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("../public/globe/land.bin", import.meta.url), Buffer.from(bin.buffer));

// Soften the mask for the stone globe's relief: its shader reads 0.5 as the coastline and the
// gradient either side as the bevel.
let soft = Float32Array.from(mask);
const RADIUS = 3;
for (let pass = 0; pass < 2; pass++) {
  const tmp = new Float32Array(soft.length);
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      let sum = 0;
      for (let d = -RADIUS; d <= RADIUS; d++) sum += soft[y * MW + ((x + d + MW) % MW)];
      tmp[y * MW + x] = sum / (RADIUS * 2 + 1);
    }
  }
  const out = new Float32Array(soft.length);
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      let sum = 0;
      for (let d = -RADIUS; d <= RADIUS; d++) sum += tmp[Math.min(MH - 1, Math.max(0, y + d)) * MW + x];
      out[y * MW + x] = sum / (RADIUS * 2 + 1);
    }
  }
  soft = out;
}
// Minimal 8-bit greyscale PNG.
const raw = Buffer.alloc((MW + 1) * MH);
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) raw[y * (MW + 1) + 1 + x] = Math.round(soft[y * MW + x]);
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([head, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(MW, 0);
ihdr.writeUInt32BE(MH, 4);
ihdr[8] = 8; // bit depth; colour type 0 (greyscale) and the rest stay zero
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.writeFileSync(new URL("../public/globe/land-mask.png", import.meta.url), png);
console.log("land dots:", dots.length, "| land.bin", bin.byteLength, "bytes | land-mask.png", png.length, "bytes");
