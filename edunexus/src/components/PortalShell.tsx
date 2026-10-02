"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon, type IconName } from "@/components/icons";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { Avatar } from "@/components/ui";

export type PortalNavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** `exact` avoids a parent route highlighting on child routes. */
  exact?: boolean;
};

/**
 * Sidebar collapse preference survives navigation (and reloads) via localStorage.
 * The same value is mirrored onto <html data-sidebar="collapsed"> by the inline
 * script in app/layout.tsx (pre-paint) and here (on toggle); the collapsed
 * geometry itself is applied from that attribute in globals.css, so a reload
 * renders collapsed on the very first paint — before React hydrates.
 */
const SIDEBAR_PREF_KEY = "edunexus.sidebar.collapsed";

const applySidebarAttribute = (collapsed: boolean) => {
  if (collapsed) document.documentElement.setAttribute("data-sidebar", "collapsed");
  else document.documentElement.removeAttribute("data-sidebar");
};

/*
 * Tiny store around the localStorage preference so `useSyncExternalStore` can
 * read it without hydration mismatches (server snapshot = expanded) and so a
 * toggle re-renders every subscribed shell.
 */
const sidebarPrefStore = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    sidebarPrefStore.listeners.add(listener);
    return () => sidebarPrefStore.listeners.delete(listener);
  },
  emit() {
    sidebarPrefStore.listeners.forEach((listener) => listener());
  },
};

const readSidebarPref = () => {
  try {
    return window.localStorage.getItem(SIDEBAR_PREF_KEY) === "1";
  } catch {
    return false; // storage unavailable (private mode, etc.)
  }
};

const writeSidebarPref = (collapsed: boolean) => {
  try {
    window.localStorage.setItem(SIDEBAR_PREF_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
  applySidebarAttribute(collapsed);
  sidebarPrefStore.emit();
};

export function PortalShell({
  portal,
  subtitle,
  userName,
  userEmail,
  roleLabel,
  nav,
  homeHref = "/",
  showNotificationBell = false,
  logoUrl,
  children,
}: {
  portal: string;
  subtitle?: string;
  userName: string;
  userEmail: string;
  roleLabel: string;
  nav: PortalNavItem[];
  homeHref?: string;
  /** Opt-in per portal — the bell reads the shared per-user notification feed. */
  showNotificationBell?: boolean;
  /** Institution crest — falls back to the bundled logo when omitted. */
  logoUrl?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sidebarCollapsed = useSyncExternalStore(sidebarPrefStore.subscribe, readSidebarPref, () => false);
  const toggleSidebar = useCallback(() => writeSidebarPref(!readSidebarPref()), []);
  const dialogRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  // Ctrl/Cmd+B toggles the sidebar, VS Code style.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  useEffect(() => {
    if (!open) return;
    const opener = menuButtonRef.current;
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>("button[aria-label='Close navigation']")?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      opener?.focus();
    };
  }, [open]);

  const isActive = (item: PortalNavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");

  /*
   * Markup is ALWAYS the expanded sidebar; the collapsed rail (and the hover
   * overlay that re-expands it) is applied purely by CSS from the
   * data-sidebar attribute — see the sidebar-collapse block in globals.css.
   * Keeping the DOM stable means the hover overlay, the pre-paint collapse
   * and React state can never disagree.
   */
  const scrollToTop = useCallback(() => {
    setOpen(false); // close the mobile drawer first, if open
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const navLinks = () => (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label={`${portal} navigation`}>
      {nav.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={(event) => {
              setOpen(false);
              // Collapsed rail without the hover overlay (touch, mostly): the
              // first tap reveals the sidebar instead of navigating.
              const overlayOpen = asideRef.current?.matches(":hover, :focus-within") ?? false;
              if (sidebarCollapsed && !overlayOpen) {
                event.preventDefault();
                writeSidebarPref(false);
              }
            }}
            aria-current={active ? "page" : undefined}
            // The collapsed rail hides the label span; keep the link named.
            aria-label={item.label}
            className={`nav-item ${active ? "nav-item-active" : ""}`}
          >
            <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
            <span className="sidebar-label truncate">{item.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={scrollToTop}
        className="mt-3 flex w-full items-center gap-2.5 rounded-md border border-white/15 px-3 py-2 text-[13px] font-medium text-brand-100/80 transition hover:bg-white/10 hover:text-white"
      >
        <Icon name="chevronUp" className="h-[18px] w-[18px] shrink-0" />
        <span className="sidebar-label">Scroll to top</span>
      </button>
    </nav>
  );

  const brandHead = () => (
    <div className="sidebar-brand flex items-center gap-3 border-b border-white/10 px-5 py-[18px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl ?? "/logo.png"} alt="" className="h-9 w-auto rounded-md bg-white/95 p-0.5" />
      <div className="sidebar-soft min-w-0">
        <p className="font-display truncate text-[15px] font-bold leading-tight text-white">EduNexus</p>
        <p className="truncate text-[10.5px] font-medium uppercase tracking-[0.08em] text-brand-100/60">{portal}</p>
      </div>
    </div>
  );

  const identityCard = () => (
    <div className="border-t border-white/10 p-3">
      <div className="sidebar-identity-card flex items-center gap-3 rounded-md bg-white/[0.05] px-3 py-2.5">
        <Avatar name={userName} tone="light" size="sm" />
        <div className="sidebar-soft min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-white">{userName}</p>
          <p className="truncate text-[11px] text-brand-100/60">{roleLabel}</p>
        </div>
      </div>
      <div className="sidebar-identity-actions mt-2 flex gap-2">
        <Link
          href={homeHref}
          aria-label="Public site"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/15 px-2 py-2 text-[11px] font-semibold text-brand-100/90 transition hover:bg-white/10 hover:text-white"
        >
          <Icon name="home" className="h-3.5 w-3.5 shrink-0" />
          <span className="sidebar-label">Public site</span>
        </Link>
        <LogoutButton
          ariaLabel="Logout"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/15 px-2 py-2 text-[11px] font-semibold text-brand-100/90 transition hover:bg-red-500/25 hover:text-white"
        >
          <Icon name="logout" className="h-3.5 w-3.5 shrink-0" />
          <span className="sidebar-label">Logout</span>
        </LogoutButton>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <Link href="#portal-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-brand-900 focus:shadow-lg">
        Skip to main content
      </Link>
      {/* ── Desktop sidebar ─────────────────────────────── */}
      <aside
        id="portal-desktop-navigation"
        ref={asideRef}
        aria-label={`${portal} sidebar`}
        className={`surface-dark fixed inset-y-0 left-0 z-40 hidden flex-col transition-[width] duration-200 lg:flex ${sidebarCollapsed ? "w-[76px]" : "w-[248px]"}`}
      >
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-0" />
        <div className="relative flex flex-1 flex-col">
          {brandHead()}
          <div className="sidebar-soft px-5 pb-1 pt-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-100/40">Workspace</p>
          </div>
          <div className="relative flex flex-1 flex-col">
            {navLinks()}
          </div>
          {identityCard()}
        </div>
      </aside>

      {/* ── Mobile drawer ───────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => {
              setOpen(false);
              menuButtonRef.current?.focus();
            }}
            className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm"
          />
          <div
            ref={dialogRef}
            className="surface-dark animate-fade-up absolute inset-y-0 left-0 flex w-[min(280px,calc(100vw-2rem))] flex-col shadow-2xl"
            role="dialog"
            aria-modal="true"
            id="portal-mobile-navigation"
            aria-label={`${portal} navigation`}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                return;
              }
              if (event.key !== "Tab") return;
              const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
              if (!focusable?.length) return;
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-60" />
            <div className="relative flex flex-1 flex-col">
              <div className="flex items-center justify-between">
                {brandHead()}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    menuButtonRef.current?.focus();
                  }}
                  aria-label="Close navigation"
                  className="mr-3 -ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-brand-100/80 transition hover:bg-white/10 hover:text-white"
                >
                  <Icon name="x" className="h-5 w-5" />
                </button>
              </div>
              {navLinks()}
              {identityCard()}
            </div>
          </div>
        </div>
      )}

      {/* ── Content column ──────────────────────────────── */}
      <div className={`flex min-h-screen flex-col transition-[padding] duration-200 ${sidebarCollapsed ? "lg:pl-[76px]" : "lg:pl-[248px]"}`}>
        <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-controls="portal-desktop-navigation"
              aria-expanded={!sidebarCollapsed}
              aria-keyshortcuts="Meta+B Control+B"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={`${sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} (Ctrl+B / ⌘B)`}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line-strong text-ink-700 transition hover:border-brand-600 hover:text-brand-800 lg:inline-flex"
            >
              <Icon name="chevronRight" className={`h-4 w-4 transition-transform duration-200 ${sidebarCollapsed ? "" : "rotate-180"}`} />
            </button>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-controls="portal-mobile-navigation"
              aria-label="Open navigation"
              aria-expanded={open}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line-strong text-ink-700 transition hover:border-brand-600 hover:text-brand-800 lg:hidden"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold leading-tight text-brand-950">{portal}</p>
              <p className="truncate text-[11px] text-ink-400">
                {subtitle ?? "EduNexus Integrated Management"}
              </p>
            </div>

            <span className="hidden items-center gap-2 rounded-md border border-[var(--line)] bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-ink-600 sm:inline-flex">
              <Icon name="shield" className="h-3.5 w-3.5 text-accent-500" />
              {roleLabel}
            </span>
            {showNotificationBell && <NotificationBell />}
            <div className="flex items-center gap-2.5 border-l border-[var(--line)] pl-3">
              <Avatar name={userName} size="sm" />
              <div className="hidden leading-tight sm:block">
                <p className="max-w-[160px] truncate text-[13px] font-semibold text-ink-900">{userName}</p>
                <p className="max-w-[160px] truncate text-[11px] text-ink-400">{userEmail}</p>
              </div>
            </div>
          </div>
        </header>

        <main id="portal-content" tabIndex={-1} className="animate-fade-up mx-auto w-full max-w-[1400px] flex-1 px-4 py-7 sm:px-7 lg:px-9">{children}</main>

        <footer className="border-t border-[var(--line)] bg-white/70 px-4 py-4 text-center text-[11px] text-ink-400 sm:px-6 lg:px-8">
          EduNexus · {portal} — restricted access, all actions are logged
        </footer>
      </div>
    </div>
  );
}
