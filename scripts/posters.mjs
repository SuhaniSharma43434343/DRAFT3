// Stills of the 3D journey, taken from the real scene through headless Chrome (CDP, no dependencies).
//
//   node scripts/posters.mjs <url> [outdir]
//     Writes the posters that static mode shows (no WebGL, reduced motion, Data Saver):
//     public/world/<chapter>.webp. Run it against a dev or production server after changing
//     anything in src/components/world.
//
//   node scripts/posters.mjs <url> <outdir> --review=0,1.5,3.2 [--tall] [--bare] [--size=1024x600]
//     Review frames at the given journey times, with the page's copy over them (or without: --bare).
//
//   node scripts/posters.mjs <url> <outdir> --static=8 [--tall]
//     That many screens, evenly spaced down the static-mode page.
//
// The page exposes window.__journey.snap(t, seconds) when loaded with ?capture (see World.tsx).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const [url, out = "public/world"] = args.filter((a) => !a.startsWith("--"));
const CHROME =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((p) => fs.existsSync(p));
if (!url || !CHROME) {
  console.error("usage: node scripts/posters.mjs <url> [outdir] [--review=t,t,...] [--tall] [--bare] (needs Chrome; set CHROME_PATH)");
  process.exit(2);
}

// One poster per chapter of the page: [file name, journey time].
const POSTERS = [
  ["hero", 0],
  ["about", 2.0],
  ["products", 3.2],
  ["strength", 4.45],
  ["port", 6.45],
  ["visionary", 8.0],
  ["vision", 9.12],
  ["markets", 10.3],
  ["ahead", 14.1],
];
const WIDE = { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false };
const TALL = { width: 430, height: 860, deviceScaleFactor: 2, mobile: true };

fs.mkdirSync(out, { recursive: true });
const PORT = 9248;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), "posters-"))}`,
   "--no-first-run", "--enable-gpu", "--ignore-gpu-blocklist", "--hide-scrollbars", "about:blank"],
  { stdio: "ignore" },
);
let ws;
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res) => {
    pending.set(++id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
};
const shot = async (file, format, quality) => {
  const { data } = await send("Page.captureScreenshot", { format, ...(quality ? { quality } : {}) });
  fs.writeFileSync(path.join(out, file), Buffer.from(data, "base64"));
  console.log("saved", file);
};
const load = async (viewport) => {
  await send("Emulation.setDeviceMetricsOverride", viewport);
  await send("Emulation.setTouchEmulationEnabled", { enabled: viewport.mobile });
  await send("Page.navigate", { url: `${url}${url.includes("?") ? "&" : "?"}capture` });
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    if (await evaluate("!!window.__journey")) break;
    if (i === 119) throw new Error("the journey never started (is WebGL available to headless Chrome?)");
  }
  await evaluate("window.__journey.ready");
  await evaluate("document.fonts.ready.then(() => true)");
};
const bare = (on) =>
  evaluate(`document.documentElement.classList.toggle("capture-bare", ${on})`);
const snap = async (t, seconds = 0.2) => {
  await evaluate(`window.__journey.snap(${t}, ${seconds})`);
  await sleep(700); // let the entrance transitions of the copy finish
  await evaluate(`window.__journey.snap(${t}, 0.1)`);
  await sleep(150);
};

try {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page");
    } catch {}
    if (!target) await sleep(300);
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d.result ?? {});
      pending.delete(d.id);
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");

  if (flags.static !== undefined) {
    const tall = "tall" in flags;
    const viewport = tall ? TALL : { ...WIDE, width: 1440, height: 900 };
    await send("Emulation.setDeviceMetricsOverride", viewport);
    await send("Page.navigate", { url: `${url}${url.includes("?") ? "&" : "?"}static` });
    await sleep(4000);
    const count = Number(flags.static) || 8;
    const span = (await evaluate("document.documentElement.scrollHeight")) - viewport.height;
    for (let i = 0; i < count; i++) {
      await evaluate(`window.scrollTo(0, ${Math.round((span * i) / (count - 1))})`);
      await sleep(900);
      await shot(`static-${tall ? "tall" : "wide"}-${i.toFixed(2)}.jpg`, "jpeg", 82);
    }
  } else if (flags.review !== undefined) {
    const tall = "tall" in flags;
    const [sw, sh] = String(flags.size ?? "1440x900").split("x").map(Number);
    await load(tall ? TALL : { ...WIDE, width: sw, height: sh });
    await bare("bare" in flags);
    await snap(0, 3);
    for (const t of String(flags.review).split(",").map(Number)) {
      await snap(t);
      await shot(`review-${tall ? "tall" : "wide"}-${t.toFixed(2)}.jpg`, "jpeg", 82);
    }
  } else {
    await load(WIDE);
    await bare(true);
    await snap(0, 3);
    for (const [chapter, t] of POSTERS) {
      await snap(t);
      await shot(`${chapter}.webp`, "webp", 76);
    }
  }
} catch (e) {
  console.error(String(e));
  process.exitCode = 1;
} finally {
  chrome.kill();
}
