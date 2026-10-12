"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion, resolveTier, subscribe } from "@/lib/fx-core";
import type { World as Engine } from "./engine";
import { BEATS, END, PRODUCT_STEPS, TALL_LAYOUT } from "./journey";
import { clamp, smoothDamp } from "./math";

// The world behind the page, and the one place scroll is read.
//
// Scroll stays native: nothing here hijacks or smooths the page itself. Each frame the scroll
// position is turned into a journey time (beat index + progress through that beat) and a damped copy
// of it flies the camera.
//
// The copy is never hidden by this script. Each beat's block of copy is ordinary page content that
// pins with CSS; what is written here only dresses it, from where the block really is on screen:
//   --h     the block's height, so CSS can centre it or seat it at the foot
//   --p     0..1 through the beat
//   --in    0..1 as the block rises into the window      --out   0..1 as it leaves at the top
//   .beat-long / --over / --q   a block taller than the window is drawn up through it as the reader
//                               scrolls, instead of resting with its head or foot cut off
// Every one of them defaults to "fully shown" in the stylesheet. A block that is off screen has
// --in and --out removed again, and if frames stop arriving while the reader keeps scrolling a
// scroll listener clears the rest, so copy that scrolls into view is simply there.
//
// The inline script in layout.tsx has already chosen between `html.journey` (this) and `html.static`
// (posters, normal page flow) before first paint; three.js is fetched after the load event.

const CUT = 1.7; // a jump of more than this many beats is a cut through the haze, not a flight
const FOOT = 20; // air kept under a pinned block, px
const EDGE = 72; // the soft upper edge of a block's backing on tall screens (4.5rem), px

export function World() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    const root = document.documentElement;
    if (!el || !root.classList.contains("journey")) return;

    let engine: Engine | undefined;
    let cancelled = false;
    let stopTicker: (() => void) | undefined;
    const cleanups: (() => void)[] = [];

    const beats = BEATS.map((b) => document.querySelector<HTMLElement>(`[data-beat="${b.key}"]`));
    const pins = beats.map((b) => b?.querySelector<HTMLElement>(".beat-pin") ?? null);
    const wraps = pins.map((p) => (p?.firstElementChild as HTMLElement | null) ?? null);
    let chapter = "";

    /** Take back everything this script has written on the beats: they return to "fully shown". */
    const resetBeats = () => {
      beats.forEach((b) => {
        b?.removeAttribute("data-step");
        b?.classList.remove("beat-long", "beat-snap");
        for (const v of ["--h", "--p", "--in", "--out", "--over", "--q"]) b?.style.removeProperty(v);
      });
      root.style.removeProperty("--journey");
    };
    const goStatic = () => {
      cancelled = true;
      stopTicker?.();
      cleanups.splice(0).forEach((c) => c());
      engine?.dispose();
      engine = undefined;
      resetBeats();
      root.classList.remove("journey", "journey-live", "journey-cut", "at-enquiry");
      root.classList.add("static");
      // The page has just become much shorter: keep the reader in the chapter they were reading
      // (the one under mid-screen, if the driver had not got as far as naming it).
      const here =
        document.getElementById(chapter) ??
        Array.from(document.querySelectorAll<HTMLElement>("main > section"))
          .filter((s) => s.getBoundingClientRect().top < window.innerHeight / 2)
          .pop();
      here?.scrollIntoView({ behavior: "instant", block: "start" });
    };
    if (resolveTier("high", { needsWebGL: true }) === "off") {
      goStatic();
      return;
    }
    (window as unknown as { __journeyDriver?: boolean }).__journeyDriver = true;

    // ── Layout: where each beat and its block sit ────────────────────────────
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-rail] a"));
    const header = document.querySelector<HTMLElement>(".site-header");
    const tallQuery = window.matchMedia(TALL_LAYOUT);
    // The stylesheet pins with 100svh; measure that same length rather than window.innerHeight,
    // which also shrinks when a phone is pinch-zoomed.
    const ruler = document.createElement("div");
    ruler.style.cssText = "position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none";
    document.body.appendChild(ruler);
    const tops = new Float64Array(BEATS.length + 1);
    const heights = new Float64Array(BEATS.length);
    const rests = new Float64Array(BEATS.length); // where each block's top sits while it is pinned
    const drawFrom = new Float64Array(BEATS.length); // for a long block: the scroll range (within
    const drawTo = new Float64Array(BEATS.length); //   its beat) over which it is drawn up
    const long = BEATS.map(() => false);
    const overs = new Float64Array(BEATS.length); // how much of each long block does not fit, px
    let heldOver = 0;
    let view = window.innerHeight;
    let headerHeight = 64;
    let tall = tallQuery.matches;
    let docEnd = 1;
    let stale = true;
    const measure = () => {
      stale = false;
      view = ruler.offsetHeight || window.innerHeight;
      tall = tallQuery.matches;
      headerHeight = header?.getBoundingClientRect().height ?? 64;
      const rem = parseFloat(getComputedStyle(root).fontSize) || 16;
      const y = window.scrollY;
      beats.forEach((b, i) => {
        const pin = pins[i];
        const wrap = wraps[i];
        if (!b || !pin || !wrap) return;
        const clear = (parseFloat(getComputedStyle(pin).getPropertyValue("--clear")) || 5.25) * rem;
        const copy = wrap.offsetHeight;
        const room = view - clear - FOOT;
        const hero = i === 0;
        let over = Math.max(0, Math.ceil(copy - room));
        if (BEATS[i].key === "products") {
          // This block changes height as its segments open and close. While it is being stepped
          // through it keeps the largest overflow seen, so the draw-through cannot lurch.
          over = heldOver = b.hasAttribute("data-step") ? Math.max(heldOver, over) : 0;
        }
        if (long[i] !== over > 1) b.classList.toggle("beat-long", (long[i] = over > 1));
        overs[i] = long[i] ? over : 0;
        b.style.setProperty("--over", `${overs[i]}px`);
        const r = b.getBoundingClientRect();
        tops[i] = r.top + y;
        heights[i] = r.height;
        const lead = parseFloat(getComputedStyle(b).paddingTop) || 0;
        // A long block's frame sticks when it reaches the header and lets go when the beat's
        // end reaches the frame's foot; in between, the block is drawn up through it.
        drawFrom[i] = hero ? 0 : lead - clear;
        drawTo[i] = heights[i] - view + (hero ? 0 : FOOT);
        rests[i] = long[i]
          ? clear
          : hero
            ? tall
              ? view - copy - FOOT
              : clear + (room - copy) / 2
            : parseFloat(getComputedStyle(pin).top) || 0;
      });
      tops[BEATS.length] = tops[BEATS.length - 1] + heights[BEATS.length - 1];
      docEnd = Math.max(1, root.scrollHeight - view);
    };
    const onLayout = new ResizeObserver(() => (stale = true));
    onLayout.observe(document.body);
    // Each block of copy reports its own height, so its pin can centre it or seat it at the foot.
    const onCopy = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const wrap = entry.target as HTMLElement;
        wrap.closest<HTMLElement>(".beat")?.style.setProperty("--h", `${Math.ceil(wrap.offsetHeight)}px`);
      }
      stale = true;
    });
    wraps.forEach((w) => w && onCopy.observe(w));
    const onResize = () => {
      heldOver = 0;
      stale = true;
    };
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(onResize).catch(() => {});
    cleanups.push(() => {
      onLayout.disconnect();
      onCopy.disconnect();
      window.removeEventListener("resize", onResize);
      ruler.remove();
    });

    const timeAt = (y: number) => {
      if (y <= tops[0]) return 0;
      for (let i = 0; i < BEATS.length; i++) {
        if (y < tops[i + 1]) return i + (y - tops[i]) / (tops[i + 1] - tops[i]);
      }
      return END + clamp((y - tops[BEATS.length]) / view);
    };

    // ── Copy: dress each block from where it actually is on screen ───────────
    const shown = BEATS.map(() => ({ p: "", enter: "", leave: "", q: "" }));
    const near: number[] = [];
    const rects: DOMRect[] = [];
    let wasNear = new Uint8Array(BEATS.length);
    let isNear = new Uint8Array(BEATS.length);
    const snapped: HTMLElement[] = [];
    let shownStep = -1;
    let shownChapter = "";
    let shownJourney = "";
    let lastPaint = performance.now();
    /** Write a custom property; an empty value removes it, which the stylesheet reads as "fully shown". */
    const put = (b: HTMLElement, name: string, value: string) =>
      value ? b.style.setProperty(name, value) : b.style.removeProperty(name);
    /** A value that replaces "nothing set" is taken at once, not eased toward from "fully shown". */
    const snap = (b: HTMLElement) => {
      b.classList.add("beat-snap");
      snapped.push(b);
    };
    const setStep = (i: number, step: number) => {
      const b = beats[i];
      if (!b || step === shownStep) return;
      shownStep = step;
      if (step >= 0) {
        b.dataset.step = String(step);
        return;
      }
      // Off screen the list opens out again, and in the same breath stops being a long block, so
      // the opened list is never drawn with the stepped list's offset.
      b.removeAttribute("data-step");
      b.classList.remove("beat-long");
      b.style.setProperty("--over", "0px");
      long[i] = false;
      overs[i] = heldOver = 0;
    };
    const paint = (y: number) => {
      while (snapped.length) snapped.pop()!.classList.remove("beat-snap");
      // The real foot of the visible window. On a phone whose toolbar has slid away it is lower
      // than the 100svh the pins are laid out with.
      const foot = Math.max(view, window.innerHeight);
      // Read every position first, then write, so the browser lays the page out once.
      near.length = 0;
      rects.length = 0;
      isNear.fill(0);
      chapter = "";
      for (let i = 0; i < BEATS.length; i++) {
        const b = beats[i];
        const wrap = wraps[i];
        if (!b || !wrap) continue;
        const local = y - tops[i];
        if (local > -0.5 * view) chapter = b.closest("section")?.id ?? chapter;
        if (local > -1.4 * view && local < heights[i] + 0.4 * view) {
          near.push(i);
          rects.push(wrap.getBoundingClientRect());
          isNear[i] = 1;
        }
      }
      // A block that has just gone out of range (a jump, a long frame) is put back to "fully shown".
      for (let i = 0; i < BEATS.length; i++) {
        const b = beats[i];
        if (!b || !wasNear[i] || isNear[i]) continue;
        if (shown[i].enter) put(b, "--in", (shown[i].enter = ""));
        if (shown[i].leave) put(b, "--out", (shown[i].leave = ""));
        if (BEATS[i].key === "products") setStep(i, -1);
      }
      [wasNear, isNear] = [isNear, wasNear];
      for (let n = 0; n < near.length; n++) {
        const i = near[n];
        const b = beats[i]!;
        const r = rects[n];
        const now = shown[i];
        const local = y - tops[i];
        const p = clamp(local / Math.max(1, heights[i] - view));
        const ps = p.toFixed(3);
        if (ps !== now.p) put(b, "--p", (now.p = ps));
        // Rising in: from nothing as the block (and the soft edge of its backing) crosses the foot
        // of the window, complete by the time it is 60% of the way to where it rests. A block still
        // below the window carries no value at all, so it can never arrive hidden.
        let enter = "";
        if (r.top - EDGE < foot) {
          const travel = Math.max(1, foot - clamp(rests[i], 0, 0.8 * view));
          enter = clamp((foot - r.top) / (0.6 * travel)).toFixed(3);
        }
        if (enter !== now.enter) {
          if (!now.enter) snap(b);
          put(b, "--in", (now.enter = enter));
        }
        // Leaving: thin out only through a band just under the header, when the last of the
        // block is about to pass behind it. Gone above the window, the value is dropped again.
        let leave = "";
        if (r.bottom > 0) {
          const from = headerHeight + 0.2 * view;
          const to = headerHeight + 0.02 * view;
          leave = clamp((from - r.bottom) / (from - to)).toFixed(3);
        }
        if (leave !== now.leave) {
          if (!now.leave) snap(b);
          put(b, "--out", (now.leave = leave));
        }
        // A block taller than the window is drawn up through it across its pinned stretch.
        const drawn = long[i] ? clamp((local - drawFrom[i]) / Math.max(1, drawTo[i] - drawFrom[i])) : 0;
        const q = long[i] ? drawn.toFixed(3) : "";
        if (q !== now.q) put(b, "--q", (now.q = q));
        // The product list is only stepped (five segments closed) while it is on screen; anywhere
        // else every segment stays open, so it can never be found collapsed by a stalled script.
        // "On screen" is judged from where the block is laid out, before the draw-through offset.
        if (BEATS[i].key === "products") {
          const onScreen = r.top < foot && r.bottom + overs[i] * drawn > 0;
          setStep(i, onScreen ? Math.min(PRODUCT_STEPS - 1, Math.floor(p * PRODUCT_STEPS)) : -1);
        }
      }
      lastPaint = performance.now();
      if (y > tops[BEATS.length] - 0.5 * view) chapter = "contact";
      if (chapter !== shownChapter) {
        shownChapter = chapter;
        links.forEach((a) => a.classList.toggle("is-current", a.hash === `#${chapter}`));
        root.classList.toggle("at-enquiry", chapter === "contact");
      }
      const j = clamp(y / docEnd).toFixed(4);
      if (j !== shownJourney) root.style.setProperty("--journey", (shownJourney = j));
    };

    // If frames have stopped arriving but the reader is still scrolling, a block caught half way
    // through its entrance would stay half-drawn. Scroll events do not need frames: when the last
    // paint is stale, every block is put back to "fully shown" and the caches are cleared, so the
    // next real frame starts clean.
    const onScroll = () => {
      if (performance.now() - lastPaint < 400) return;
      beats.forEach((b, i) => {
        if (!b) return;
        b.classList.remove("beat-snap");
        if (shown[i].enter) put(b, "--in", (shown[i].enter = ""));
        if (shown[i].leave) put(b, "--out", (shown[i].leave = ""));
        if (BEATS[i].key === "products") setStep(i, -1);
      });
      wasNear.fill(0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener("scroll", onScroll));

    // ── Time: damped for the camera, with cuts for long jumps ────────────────
    const state = { x: 0, v: 0 };
    let first = true;
    let cutUntil = 0;
    let forced: number | null = null;
    const cut = (ms: number) => {
      cutUntil = performance.now() + ms;
      root.classList.add("journey-cut");
    };

    // In-page links fade through the haze and land on their chapter, rather than flying the
    // camera through every scene in between.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
      const target = a && a.hash.length > 1 ? document.getElementById(a.hash.slice(1)) : null;
      if (!a || !target || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      const far = Math.abs(timeAt(target.getBoundingClientRect().top + window.scrollY) - state.x) > CUT;
      const land = () => {
        target.scrollIntoView({ behavior: "auto", block: "start" });
        history.replaceState(null, "", a.hash);
        (a.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
        // Keyboard and screen-reader users continue from the chapter they asked for.
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      };
      if (!far) return land();
      cut(520);
      window.setTimeout(land, 240);
    };
    document.addEventListener("click", onClick);
    cleanups.push(() => document.removeEventListener("click", onClick));

    const capture = /[?&]capture\b/.test(location.search);
    let lastY = -1;
    let lastScroll = 0;
    let frames = 0;
    let slow = 0;
    let settled = false; // true once every scene is built: loading work must not count as slowness
    let lastFrame = performance.now();
    const frame = (dt: number) => {
      if (prefersReducedMotion()) return goStatic();
      if (stale) measure();
      const y = window.scrollY;
      paint(y);
      const target = forced ?? timeAt(y);
      const now = performance.now();
      if (y !== lastY) {
        lastY = y;
        lastScroll = now;
      }
      if (first || Math.abs(target - state.x) > CUT) {
        // A scrollbar drag or a restored scroll position: cut, do not fly.
        if (!first && now > cutUntil) cut(420);
        if (first || now > cutUntil - 200) {
          state.x = target;
          state.v = 0;
        }
        first = false;
      } else if (now > cutUntil - 260) {
        smoothDamp(state, target, 0.34, dt);
      }
      if (cutUntil && now > cutUntil) {
        cutUntil = 0;
        root.classList.remove("journey-cut");
      }
      if (!engine) return;
      engine.frame(dt, state.x);
      // If the device cannot hold 25 frames a second, give up resolution, then shadow refresh
      // rate. A steady 30 is left alone: that is a browser's energy saver, not a slow device. Only
      // frames drawn while the reader is scrolling count, because an occluded or background
      // window is throttled by the browser too.
      const elapsed = now - lastFrame;
      lastFrame = now;
      if (settled && !capture && frames >= 0 && now - lastScroll < 300) {
        if (elapsed > 40) slow++;
        if (++frames === 140) {
          if (slow > 84 && !engine.degrade()) frames = -1;
          else frames = 0;
          slow = 0;
        }
      }
    };
    stopTicker = subscribe(frame);

    // ── Engine: after the load event, never while the headline is painting ───
    const boot = async () => {
      const { createWorld } = await import("./engine");
      if (cancelled) return;
      const small = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
      const made = createWorld(el, { small });
      engine = made;
      const onStage = new ResizeObserver(() => made.resize());
      onStage.observe(el);
      const onLost = (e: Event) => {
        e.preventDefault();
        goStatic();
      };
      made.canvas.addEventListener("webglcontextlost", onLost);
      cleanups.push(() => {
        onStage.disconnect();
        made.canvas.removeEventListener("webglcontextlost", onLost);
      });
      made.frame(0, state.x);
      root.classList.add("journey-live");
      made.ready.then(() => window.setTimeout(() => (settled = true), 1500)).catch(() => {});
      if (capture) {
        // For scripts/posters.mjs and for checking a scene: hold the journey at time t and draw
        // it at once, without waiting on requestAnimationFrame (which a hidden tab does not get).
        (window as unknown as { __journey?: unknown }).__journey = {
          ready: made.ready,
          snap: (t: number, seconds = 0) => {
            measure();
            const i = Math.min(BEATS.length - 1, Math.max(0, Math.floor(t)));
            window.scrollTo(0, tops[i] + (t - i) * (tops[i + 1] - tops[i]));
            paint(window.scrollY);
            forced = t;
            first = false;
            state.x = t;
            state.v = 0;
            for (let n = Math.max(1, Math.round(seconds * 30)); n > 0; n--) made.frame(1 / 30, t);
          },
        };
      }
    };
    let idle: number | undefined;
    const arm = () => {
      idle = window.setTimeout(() => boot().catch(goStatic), 80);
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", arm);
      window.clearTimeout(idle);
      stopTicker?.();
      cleanups.splice(0).forEach((c) => c());
      engine?.dispose();
      engine = undefined;
      resetBeats();
      delete (window as unknown as { __journeyDriver?: boolean }).__journeyDriver;
      root.classList.remove("journey-live", "journey-cut", "at-enquiry");
    };
  }, []);

  return (
    <>
      <div ref={host} className="world-stage" aria-hidden="true" />
      <div className="world-scrim" aria-hidden="true" />
      <div className="world-veil" aria-hidden="true" />
    </>
  );
}
