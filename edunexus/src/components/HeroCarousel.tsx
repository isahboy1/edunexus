"use client";

import Link from "next/link";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";

export type HeroSlide = {
  eyebrow: string;
  title: string;
  /** Optional substring of `title` rendered in the Academia teal. */
  titleHighlight?: string;
  body: string;
  ctas: { href: string; label: string; variant: "accent" | "ghost" }[];
  meta?: ReactNode;
  /** Illustration filling the slide background, dimmed under the copy. */
  image: string;
  imageAlt: string;
  /** Dark info panel, Academia-style, pinned right (large screens). */
  panel?: { heading: string; items: string[] };
  /** Background tone behind the illustration gradient. */
  tone: "navy" | "blue" | "forest";
};

const TONES: Record<HeroSlide["tone"], string> = {
  navy: "#18374b",
  blue: "#25495a",
  forest: "#263f3b",
};

const DURATION_MS = 7000;

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[#4dd0c3]">
      <path d="M4 10.5l4 4 8-9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" />
    </svg>
  );
}

function ArrowIcon({ dir = "right" }: { dir?: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`h-4 w-4 ${dir === "left" ? "rotate-180" : ""}`}
    >
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HighlightedTitle({ title, highlight }: { title: string; highlight?: string }) {
  if (!highlight || !title.includes(highlight)) return <>{title}</>;
  const i = title.indexOf(highlight);
  return (
    <>
      {title.slice(0, i)}
      <span className="text-[#1eb2a6]">{highlight}</span>
      {title.slice(i + highlight.length)}
    </>
  );
}

export default function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [autoplayEnabled, setAutoplayEnabled] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = slides.length;

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count]
  );

  // Autoplay is opt-in to avoid moving content without the visitor's consent.
  useEffect(() => {
    if (paused || !autoplayEnabled || count < 2) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), DURATION_MS);
    return () => clearTimeout(t);
  }, [index, paused, autoplayEnabled, count]);

  if (count === 0) return null;
  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label="Highlights"
      onKeyDownCapture={(event) => {
        if (event.key === "Tab" && autoplayEnabled) setAutoplayEnabled(false);
      }}
      className="group relative overflow-hidden bg-[#18374b]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(index - 1);
        if (e.key === "ArrowRight") go(index + 1);
      }}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 48) go(index + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
    >
      {/* Sliding track */}
      <div
        className="flex transition-transform duration-[650ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((s, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}: ${s.eyebrow}`}
            aria-hidden={i !== index}
            inert={i !== index}
            className="relative min-w-full"
            style={{ backgroundColor: TONES[s.tone] }}
          >
            {/* Full-bleed illustration + dark overlay (Academia bg_1 style) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.image}
              alt=""
              aria-hidden
              loading={i === 0 ? "eager" : "lazy"}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
            <div aria-hidden className="absolute inset-0 bg-[#102a3a]/80" />

            <div className="relative grid gap-10 px-6 py-16 sm:px-10 md:min-h-[520px] md:grid-cols-[1.15fr_0.85fr] md:items-center md:py-20 lg:px-16">
              {/* Copy — Academia hero text block */}
              <div className="max-w-xl">
                <p className="flex items-center gap-3 text-[12px] font-medium uppercase tracking-[2px] text-white/70">
                  <span aria-hidden className="h-px w-8 bg-[#1eb2a6]" />
                  {s.eyebrow}
                </p>
                <h1 className="hero-title mt-5 max-w-[560px] text-[2.05rem] font-semibold leading-[1.12] tracking-[-0.02em] text-white sm:text-[2.55rem] lg:text-[2.9rem]">
                  <HighlightedTitle title={s.title} highlight={s.titleHighlight} />
                </h1>
                <p className="mt-4 max-w-[500px] text-[14.5px] leading-[1.85] text-white/70">
                  {s.body}
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  {s.ctas.map((c) => (
                    <Link
                      key={c.href + c.label}
                      href={c.href}
                      className={
                        c.variant === "accent"
                          ? "inline-flex items-center gap-2 rounded-[4px] bg-[#1eb2a6] px-6 py-4 text-[12px] font-semibold uppercase tracking-[1px] text-white shadow-[0_24px_36px_-11px_rgba(0,0,0,0.09)] transition-colors hover:bg-[#188f85]"
                          : "inline-flex items-center gap-2 rounded-[4px] bg-white px-6 py-4 text-[12px] font-semibold uppercase tracking-[1px] text-[#1eb2a6] transition-colors hover:bg-white/90"
                      }
                    >
                      {c.label}
                      <ArrowIcon />
                    </Link>
                  ))}
                </div>
                {s.meta && (
                  <p className="mt-8 border-t border-white/15 pt-5 text-[12px] text-white/65">
                    {s.meta}
                  </p>
                )}
              </div>

              {/* Right info panel — Academia's signature dark card */}
              {s.panel && (
                <div className="relative z-10 hidden rounded-md bg-[#0f2432] p-9 lg:block">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                    {s.panel.heading}
                  </p>
                  <ul className="mt-6 space-y-4">
                    {s.panel.items.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-[14px] leading-relaxed text-white/85">
                        <CheckIcon />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Slide navigation — Academia's minimal dots on a dark bar */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-[#0e2231]/85 px-6 py-4 backdrop-blur-sm sm:px-10 lg:px-16">
        <div className="flex items-center gap-3" aria-label="Carousel controls">
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.eyebrow}
              type="button"
              aria-current={slideIndex === index ? "true" : undefined}
              aria-label={`Show slide ${slideIndex + 1}: ${slide.eyebrow}`}
              onClick={() => go(slideIndex)}
              className="group/dot flex h-9 items-center"
            >
              <span
                aria-hidden
                className={`block h-1 rounded-full transition-all duration-300 ${
                  slideIndex === index ? "w-9 bg-[#1eb2a6]" : "w-4 bg-white/30 group-hover/dot:bg-white/60"
                }`}
              />
            </button>
          ))}
          <button
            type="button"
            aria-label={autoplayEnabled ? "Pause automatic slides" : "Play automatic slides"}
            aria-pressed={autoplayEnabled}
            onClick={() => setAutoplayEnabled((enabled) => !enabled)}
            className="ml-2 inline-flex h-8 items-center rounded-[4px] border border-white/25 px-3 text-[11px] font-medium text-white/85 transition hover:bg-white/10 hover:text-white"
          >
            {autoplayEnabled ? "Pause" : "Play"}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-xs tabular-nums tracking-widest text-white/60 sm:inline" aria-live="polite">
            {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => go(index - 1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white/80 transition hover:border-[#1eb2a6] hover:bg-[#1eb2a6] hover:text-white"
            >
              <ArrowIcon dir="left" />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => go(index + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white/80 transition hover:border-[#1eb2a6] hover:bg-[#1eb2a6] hover:text-white"
            >
              <ArrowIcon />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
