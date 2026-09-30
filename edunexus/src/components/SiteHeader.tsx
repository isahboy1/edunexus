"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/programmes", label: "Programmes" },
  { href: "/admissions", label: "Admissions" },
  { href: "/news", label: "News" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({
  instName,
  instShort,
  logoUrl,
}: {
  instName: string;
  instShort: string;
  /** Institution crest — falls back to the bundled logo when omitted. */
  logoUrl?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>("a[href]")?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[var(--site-header,#188f85)] text-white">
      <Link href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-[var(--site-header,#188f85)] focus:shadow-lg">
        Skip to main content
      </Link>
      {/* Institutional details and quick portal links */}
      <div className="hidden bg-[var(--site-header-deep,#137169)] text-white md:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 text-[10px] tracking-wide text-white/85 sm:px-6 lg:px-8">
          <span>{instName}</span>
          <span className="flex items-center gap-5">
            <span className="text-white/60">Knowledge · Character · Service</span>
            <Link href="/login" className="text-white/85 transition hover:text-white">
              Applicant Login
            </Link>
            <Link href="/student/dashboard" className="text-white/85 transition hover:text-white">
              Student Portal
            </Link>
          </span>
        </div>
      </div>

      {/* Main bar */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label={`${instShort} home`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl ?? "/logo.png"} alt="" className="h-10 w-auto" />
          <span className="leading-none">
            <span className="block text-[16px] font-bold tracking-tight text-brand-900">
              {instShort}
            </span>
            <span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.14em] text-white">Knowledge · Character · Service</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={`relative rounded-md px-3 py-2 text-[13px] font-medium transition ${
                isActive(n.href)
                  ? "text-white"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              {n.label}
              {isActive(n.href) && (
                <span
                  aria-hidden
                  className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-white"
                />
              )}
            </Link>
          ))}
          <span aria-hidden className="mx-2 h-5 w-px bg-white/25" />
          <Link
            href="/login"
            className="rounded-md px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="ml-1 inline-flex items-center gap-1.5 rounded-[4px] bg-[#1eb2a6] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[1px] text-white shadow-[0_24px_36px_-11px_rgba(0,0,0,0.25)] transition hover:bg-[#188f85]"
          >
            Apply Now
            <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-3.5 w-3.5">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-site-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex h-10 w-10 items-center justify-center rounded-md border border-white/25 text-white transition hover:bg-white/10 lg:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-5 w-5">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile panel */}
      {open && (
        <nav
          ref={menuRef}
          id="mobile-site-nav"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              menuButtonRef.current?.focus();
            }
          }}
          className="border-t border-white/10 bg-[#188f85] px-6 pb-5 pt-2 lg:hidden"
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={`block border-b border-white/10 py-3 text-sm font-medium ${
                isActive(n.href) ? "text-white" : "text-white/85"
              }`}
            >
              {n.label}
            </Link>
          ))}
          <div className="mt-4 flex gap-3">
            <Link href="/login" onClick={() => setOpen(false)} className="flex-1 rounded-[4px] border border-white/40 px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[1px] text-white transition hover:bg-white/10">
              Login
            </Link>
            <Link href="/register" onClick={() => setOpen(false)} className="academia-btn flex-1 !px-3 !py-2.5 text-[11px]">
              Apply Now
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter({
  instName,
  instShort,
  address,
  email,
  phone,
  logoUrl,
}: {
  instName: string; instShort: string; address: string; email: string; phone: string;
  /** Institution crest — falls back to the bundled logo when omitted. */
  logoUrl?: string;
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 bg-[#eef1f0]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl ?? "/logo.png"} alt="" className="h-9 w-auto rounded-md bg-white/95 p-0.5" />
            <span className="text-[15px] font-bold tracking-tight text-[#1d2a32]">{instShort}</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-600">{instName}</p>
          <p className="mt-3 text-sm text-ink-400">{address}</p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#188f85]">Explore</p>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-600">
            <li><Link className="transition hover:text-brand-700" href="/programmes">Programmes</Link></li>
            <li><Link className="transition hover:text-brand-700" href="/admissions">Admissions</Link></li>
            <li><Link className="transition hover:text-brand-700" href="/news">News &amp; Events</Link></li>
            <li><Link className="transition hover:text-brand-700" href="/contact">Contact</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#188f85]">Portals</p>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-600">
            <li><Link className="transition hover:text-brand-700" href="/register">Apply for Admission</Link></li>
            <li><Link className="transition hover:text-brand-700" href="/login">Applicant Login</Link></li>
            <li><Link className="transition hover:text-brand-700" href="/student/dashboard">Student Portal</Link></li>
            <li><Link className="transition hover:text-brand-700" href="/admissions">Check Admission Status</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#188f85]">Contact</p>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-600">
            <li className="flex items-start gap-2">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[#1eb2a6]">
                <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <a className="break-all transition hover:text-[#188f85]" href={`mailto:${email}`}>{email}</a>
            </li>
            <li className="flex items-start gap-2">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[#1eb2a6]">
                <path d="M5 4h4l2 5-2.5 1.5a12 12 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              <a className="transition hover:text-[#188f85]" href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-100">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-ink-400 sm:flex-row sm:px-6 lg:px-8">
          <span>
            © {year} {instShort}. All rights reserved.
          </span>
          <span className="tracking-wide">Knowledge · Character · Service</span>
        </div>
      </div>
    </footer>
  );
}
