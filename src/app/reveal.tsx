"use client";

import { useEffect } from "react";

// Fades [data-fx-reveal] elements in on first scroll into view. Runs after hydration so the markup stays in sync.
export function Reveal() {
  useEffect(() => {
    const els = document.querySelectorAll("[data-fx-reveal]");
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("is-in"));
      return;
    }
    // The stylesheet only holds the entrances back while this class says someone is watching.
    document.documentElement.classList.add("reveal-armed");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-in");
            io.unobserve(en.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    els.forEach((e) => io.observe(e));
    return () => {
      io.disconnect();
      document.documentElement.classList.remove("reveal-armed");
    };
  }, []);
  return null;
}
