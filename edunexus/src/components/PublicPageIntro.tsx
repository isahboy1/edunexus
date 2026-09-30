import { ReactNode } from "react";

export function PublicPageIntro({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-line pb-7 pt-9 sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:pb-8 sm:pt-12">
      <div className="max-w-3xl">
        <p className="academia-eyebrow mb-3 flex items-center gap-3">
          <span aria-hidden className="h-px w-8 bg-[#1eb2a6]" />
          {eyebrow}
        </p>
        <h1
          className="text-[2.1rem] font-semibold leading-[1.15] tracking-[-0.015em] text-[#1d2a32] sm:text-[2.6rem]"
          style={{ fontFamily: "var(--font-geist-sans, ui-sans-serif, system-ui, sans-serif)" }}
        >
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-[14px] leading-[1.85] text-ink-600">{description}</p>
      </div>
      {aside && <div className="w-full shrink-0 sm:w-auto">{aside}</div>}
    </header>
  );
}
