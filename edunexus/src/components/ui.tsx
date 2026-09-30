"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

/* ── Status ─────────────────────────────────────────────── */

const STATUS_TONE: Record<string, string> = {
  DRAFT: "badge-gray",
  PAYMENT_PENDING: "badge-amber",
  PAID: "badge-blue",
  SUBMITTED: "badge-blue",
  UNDER_REVIEW: "badge-amber",
  SHORTLISTED: "badge-purple",
  SCREENING: "badge-purple",
  ADMITTED: "badge-green",
  REJECTED: "badge-red",
  WITHDRAWN: "badge-gray",
  PENDING: "badge-amber",
  VERIFIED: "badge-green",
  PENDING_HOD: "badge-amber",
  PENDING_FINAL: "badge-amber",
  PROCESSING: "badge-amber",
  SUCCESSFUL: "badge-green",
  APPROVED: "badge-green",
  FAILED: "badge-red",
  CANCELLED: "badge-gray",
  REFUNDED: "badge-gray",
  ACTIVE: "badge-green",
  OFFERED: "badge-green",
  ACCEPTED: "badge-green",
  PUBLISHED: "badge-green",
  OWING: "badge-red",
  PART_PAID: "badge-amber",
  DROPPED: "badge-gray",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_TONE[status] ?? "badge-gray";
  return (
    <span className={cls}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      {formatStatus(status)}
    </span>
  );
}

export function formatStatus(s: string) {
  return s
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

/* ── Avatar ─────────────────────────────────────────────── */

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  size = "md",
  tone = "brand",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  tone?: "brand" | "light";
}) {
  const dim = size === "sm" ? "h-8 w-8 text-[11px]" : size === "lg" ? "h-12 w-12 text-base" : "h-10 w-10 text-xs";
  const skin =
    tone === "light"
      ? "bg-white/10 text-white ring-1 ring-inset ring-white/20"
      : "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-100";
  return (
    <span className={`inline-flex select-none items-center justify-center rounded-md font-bold tracking-wide ${dim} ${skin}`}>
      {initials(name)}
    </span>
  );
}

/* ── Layout blocks ──────────────────────────────────────── */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: IconName;
}) {
  return (
    <header className="animate-fade-up flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-accent-600">
            <span aria-hidden className="h-px w-5 bg-accent-500/70" />
            {eyebrow}
          </p>
        )}
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <span aria-hidden="true" className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100 sm:inline-flex">
              <Icon name={icon} className="h-[18px] w-[18px]" />
            </span>
          )}
          <h1 className="min-w-0 text-[25px] font-semibold leading-tight tracking-[-0.025em] text-brand-950 sm:text-[28px]">
            {title}
          </h1>
        </div>
        {description && <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-600">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </header>
  );
}

export function SectionCard({
  title,
  subtitle,
  icon,
  children,
  actions,
  padded = true,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  icon?: IconName;
  children: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section className={`card-flush animate-fade-up overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[#fcfdfb] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {icon && (
              <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                <Icon name={icon} className="h-4 w-4" />
              </span>
            )}
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              {title && <h2 className="font-display text-[16px] font-semibold leading-tight text-ink-900">{title}</h2>}
              {subtitle && <p className="hidden text-xs text-ink-600 sm:block">{subtitle}</p>}
            </div>
          </div>
          {actions}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

/* ── Stats ──────────────────────────────────────────────── */

const TONES = {
  brand: { wrap: "bg-brand-50 text-brand-700 ring-brand-100", value: "text-brand-900" },
  accent: { wrap: "bg-emerald-50 text-emerald-700 ring-emerald-100", value: "text-emerald-900" },
  amber: { wrap: "bg-amber-50 text-amber-700 ring-amber-100", value: "text-amber-900" },
  slate: { wrap: "bg-slate-100 text-ink-700 ring-slate-200", value: "text-ink-900" },
  rose: { wrap: "bg-rose-50 text-rose-700 ring-rose-100", value: "text-rose-900" },
} as const;

export type StatTone = keyof typeof TONES;

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "brand",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: IconName;
  tone?: StatTone;
  href?: string;
}) {
  const t = TONES[tone];
  const body = (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-600">{label}</p>
        {icon && (
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ring-1 ring-inset ${t.wrap}`}>
            <Icon name={icon} className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className={`currency mt-3.5 break-words text-[25px] font-semibold leading-tight tracking-[-0.03em] sm:text-[27px] ${t.value}`}>{value}</p>
      {hint && <p className="mt-2 text-xs text-ink-600">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card-hover group block rounded-lg border border-[var(--line)] bg-white p-5">
        {body}
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 opacity-0 transition-opacity group-hover:opacity-100">
          Open <Icon name="arrowRight" className="h-3.5 w-3.5" />
        </span>
      </Link>
    );
  }
  return <div className="card-hover rounded-lg border border-[var(--line)] bg-white p-5">{body}</div>;
}

/* ── Feedback ───────────────────────────────────────────── */

export function Alert({
  kind,
  title,
  children,
}: {
  kind: "success" | "error" | "info" | "warn";
  title?: string;
  children: ReactNode;
}) {
  const map = {
    success: {
      cls: "bg-emerald-50/80 border-emerald-200 text-emerald-900 ring-emerald-100",
      ico: "checkCircle",
    },
    error: { cls: "bg-red-50/80 border-red-200 text-red-800 ring-red-100", ico: "alert" },
    info: { cls: "bg-brand-50/80 border-brand-100 text-brand-900 ring-brand-100", ico: "info" },
    warn: { cls: "bg-amber-50/80 border-amber-200 text-amber-900 ring-amber-100", ico: "alert" },
  } as const;
  const m = map[kind];
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${m.cls}`}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
    >
      <Icon name={m.ico as IconName} className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5 opacity-90" : undefined}>{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon = "layers",
  action,
}: {
  title: string;
  description?: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-slate-50 text-ink-400 ring-1 ring-inset ring-slate-200">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-3.5 font-display text-[15px] font-bold text-ink-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Progress({
  value,
  max = 100,
  label,
  hint,
}: {
  value: number;
  max?: number;
  label?: string;
  hint?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div>
      {(label || hint) && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          {label && <span className="font-semibold text-ink-700">{label}</span>}
          {hint && <span className="text-ink-600">{hint}</span>}
        </div>
      )}
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
      >
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-ink-600" role="status" aria-live="polite">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" aria-hidden />
      {label}
    </div>
  );
}

/* ── Forms ──────────────────────────────────────────────── */

export function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  placeholder,
  options,
  textarea,
  error,
  className,
  min,
  max,
  hint,
  autoComplete,
  minLength,
  disabled,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  placeholder?: string;
  options?: { value: string; label: string }[];
  textarea?: boolean;
  error?: string;
  className?: string;
  min?: number;
  max?: number;
  hint?: string;
  autoComplete?: string;
  minLength?: number;
  disabled?: boolean;
}) {
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined;
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {options ? (
        <select id={name} name={name} className="select" defaultValue={defaultValue} required={required} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={describedBy}>
          <option value="">— Select —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : textarea ? (
        <textarea
          id={name}
          name={name}
          className="textarea"
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          maxLength={max}
          minLength={minLength}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          className="input"
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          min={min}
          max={max}
          minLength={minLength}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      )}
      {hint && !error && <p id={`${name}-hint`} className="mt-1.5 text-xs text-ink-600">{hint}</p>}
      {error && <p id={`${name}-error`} className="error-text" role="alert">{error}</p>}
    </div>
  );
}
