"use client";

import { useEffect, useRef, useState } from "react";

export type CounterStat = { label: string; value: number };

/**
 * Academia-style teal stats band. Values count up the first time the band
 * scrolls into view; skipped entirely for prefers-reduced-motion visitors
 * (server-rendered numbers would already be static in that case, and this
 * client renders the final value immediately when motion is reduced).
 */
export default function CountersBand({ stats }: { stats: CounterStat[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState<number[]>(() => stats.map((s) => s.value));

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return; // keep final values

    let started = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || started) return;
        started = true;
        observer.disconnect();

        setDisplay(stats.map(() => 0));
        const DURATION_MS = 1200;
        const t0 = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - t0) / DURATION_MS, 1);
          // easeOutCubic
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(stats.map((s) => Math.round(s.value * eased)));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.35 }
    );

    const node = ref.current;
    if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [stats]);

  return (
    <section ref={ref} aria-label="Institution at a glance" className="academia-counters mt-16 md:mt-24">
      <div className="grid grid-cols-2 md:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={[
              "px-5 py-8 text-center",
              i % 2 === 1 ? "border-l border-white/15" : "",
              i < 2 ? "border-b border-white/15 md:border-b-0" : "",
              i > 0 ? "md:border-l md:border-white/15" : "",
            ].join(" ")}
          >
            <p className="text-[2.4rem] font-semibold tabular-nums leading-none text-white">
              {display[i]}
            </p>
            <p className="mt-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-white/70">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
