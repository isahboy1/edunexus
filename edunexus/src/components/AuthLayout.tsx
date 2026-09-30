import Link from "next/link";
import { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

/**
 * Split-screen shell for the sign-in / registration pages: a branded,
 * illustration-led panel on the left and the focused form column on the right.
 */
export function AuthLayout({
  instName,
  instShort,
  address,
  email,
  phone,
  eyebrow,
  headline,
  blurb,
  bullets,
  artSrc = "/slides/portal.svg",
  formWidth = "md",
  logoUrl,
  children,
}: {
  instName: string;
  instShort: string;
  address: string;
  email: string;
  phone: string;
  eyebrow: string;
  headline: string;
  blurb: string;
  bullets: { icon: IconName; title: string; body: string }[];
  artSrc?: string;
  /** Width of the form column — wider for multi-field registration. */
  formWidth?: "md" | "lg";
  /** Institution crest — falls back to the bundled logo when omitted. */
  logoUrl?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      {/* ── Brand panel ─────────────────────────────────── */}
      <aside className="surface-dark relative hidden min-h-screen flex-col justify-between overflow-hidden p-8 lg:flex xl:p-12 2xl:p-14">
        <Link href="#auth-form" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-brand-900 focus:shadow-lg">
          Skip to account form
        </Link>
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-0" />
        {/* Single accent rule along the seam — quiet, architectural. */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-accent-500/50 to-transparent" />

        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl ?? "/logo.png"} alt="" className="h-11 w-auto rounded-lg bg-white/95 p-1" />
            <span className="leading-tight">
              <span className="font-display block text-[15px] font-bold tracking-tight text-white">{instShort}</span>
              <span className="block text-[11px] text-brand-100/60">{instName}</span>
            </span>
          </Link>

          <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a8c9ad] xl:mt-10">{eyebrow}</p>
          <h1 className="font-display mt-3 max-w-lg text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-white xl:text-[36px]">{headline}</h1>
          <p className="mt-4 max-w-lg text-[13px] leading-[1.8] text-brand-100/75">{blurb}</p>

          <ul className="mt-7 space-y-4 border-t border-white/10 pt-5">
            {bullets.map((b) => (
              <li key={b.title} className="flex items-start gap-3.5">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-emerald-300">
                  <Icon name={b.icon} className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-white">{b.title}</p>
                  <p className="mt-0.5 max-w-xs text-[12px] leading-relaxed text-brand-100/60">{b.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-6">
          <div className="pointer-events-none w-full max-w-[420px] overflow-hidden rounded-md shadow-xl ring-1 ring-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={artSrc} alt="" className="block w-full" />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-[11px] text-brand-100/65">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="pin" className="h-3.5 w-3.5" /> {address}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="mail" className="h-3.5 w-3.5" /> {email}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="phone" className="h-3.5 w-3.5" /> {phone}
            </span>
          </div>
        </div>
      </aside>

      {/* ── Form column ─────────────────────────────────── */}
      <main id="auth-content" tabIndex={-1} className="relative flex min-w-0 flex-col bg-[var(--paper)]">
        {/* Compact banner on small screens */}
        <div className="surface-dark relative overflow-hidden px-5 py-4 sm:px-6 sm:py-5 lg:hidden">
          <Link href="#auth-form" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-brand-900 focus:shadow-lg">
            Skip to account form
          </Link>
          <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl ?? "/logo.png"} alt="" className="h-9 w-auto rounded-md bg-white/95 p-0.5" />
            <div>
              <p className="text-[13px] font-extrabold text-white">{instShort}</p>
              <p className="text-[11px] text-brand-100/70">{instName}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
          <div className={formWidth === "lg" ? "w-full max-w-[560px]" : "w-full max-w-[420px]"}>{children}</div>
        </div>

        <div className="border-t border-[var(--line)] px-5 py-4 text-center text-[11px] text-ink-400 sm:px-8">
          © {new Date().getFullYear()} {instShort} · Secure portal access
        </div>
      </main>
    </div>
  );
}
