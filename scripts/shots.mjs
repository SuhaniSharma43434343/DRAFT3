// Screenshots through headless Chrome (CDP, no dependencies).
// Usage: node scripts/shots.mjs <url> <outdir> [--reduced]
// Writes desktop-top, desktop-markets-*, desktop-full, mobile-top, mobile-markets, mobile-full.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [url, out] = process.argv.slice(2);
const reduced = process.argv.includes("--reduced");
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
if (!url || !out || !CHROME) {
  console.error("usage: node scripts/shots.mjs <url> <outdir> (needs Chrome; set CHROME_PATH)");
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const PORT = 9247;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), "shots-"))}`,
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
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
const shot = async (name, clip) => {
  const { data } = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip, captureBeyondViewport: true } : {}) });
  fs.writeFileSync(path.join(out, name), Buffer.from(data, "base64"));
  console.log("saved", name);
};
const scrollTo = async (sel, offset = 0) => {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,e.getBoundingClientRect().top+scrollY-innerHeight*${offset})})()`);
  await sleep(2600);
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
  if (reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  for (const v of [
    { name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
    { name: "mobile", width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  ]) {
    await send("Emulation.setDeviceMetricsOverride", v);
    await send("Emulation.setTouchEmulationEnabled", { enabled: v.mobile });
    await send("Page.navigate", { url });
    await sleep(6000);
    await shot(`${v.name}-top.png`);
    const regions = await evaluate("document.querySelectorAll('[data-region]').length");
    if (v.name === "desktop") {
      await scrollTo("#products", 0.05);
      await shot("desktop-products.png");
      await scrollTo("#markets", 0.05);
      await shot("desktop-markets-intro.png");
    }
    for (let i = 0; i < regions; i++) {
      if (v.mobile && i !== 1) continue;
      await scrollTo(`[data-region="${i}"]`, v.mobile ? 0.5 : 0.25);
      await shot(`${v.name}-markets-${i + 1}.png`);
    }
    // Full page: walk the page first so every section has been revealed.
    const height = await evaluate("document.documentElement.scrollHeight");
    for (let y = 0; y < height; y += v.height * 0.8) {
      await evaluate(`window.scrollTo(0,${y})`);
      await sleep(250);
    }
    await evaluate("window.scrollTo(0,0)");
    await sleep(2500);
    await shot(`${v.name}-full.png`, { x: 0, y: 0, width: v.width, height, scale: 1 });
  }
} finally {
  chrome.kill();
}
