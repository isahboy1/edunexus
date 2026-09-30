"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui";
import { api, apiUpload } from "@/lib/laravel";
import { mixToBlack, mixToWhite } from "@/lib/branding";

interface BrandingState {
  primary: string;
  accent: string;
  logoUrl: string | null;
}

/** Curated institutional palettes drawn from Nigerian and African colleges. */
const PRESETS: { name: string; primary: string; accent: string }[] = [
  { name: "EduNexus (default)", primary: "#2B6074", accent: "#2D684F" },
  { name: "Royal Purple", primary: "#6D28D9", accent: "#0D9488" },
  { name: "Crimson Banner", primary: "#B91C1C", accent: "#1D4ED8" },
  { name: "Ocean Blue", primary: "#1D4ED8", accent: "#0F766E" },
  { name: "Forest Green", primary: "#166534", accent: "#B45309" },
  { name: "Sapphire & Gold", primary: "#1E3A8A", accent: "#CA8A04" },
  { name: "Sunrise Orange", primary: "#C2410C", accent: "#134E4A" },
  { name: "Obi Indigo", primary: "#3730A3", accent: "#B91C1C" },
];

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
        {label}
      </label>
      <div className="mt-2 flex items-center gap-3">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded-md border border-line-strong bg-white p-1"
          aria-label={`${label} picker`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-base w-32 font-mono text-sm"
          maxLength={7}
          aria-label={`${label} hex`}
        />
      </div>
      <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
    </div>
  );
}

function RampPreview({ seed, label }: { seed: string; label: string }) {
  const steps: [string, string][] = [
    ["50", mixToWhite(seed, 0.92)],
    ["100", mixToWhite(seed, 0.82)],
    ["500", mixToWhite(seed, 0.35)],
    ["700", seed],
    ["800", mixToBlack(seed, 0.28)],
    ["900", mixToBlack(seed, 0.48)],
    ["950", mixToBlack(seed, 0.62)],
  ];
  return (
    <div className="min-w-[180px] flex-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">{label}</p>
      <div className="mt-2 flex h-9 overflow-hidden rounded-md border border-line-strong">
        {steps.map(([shade, color]) => (
          <div key={shade} className="flex flex-1 items-end justify-center pb-0.5" style={{ background: color }} title={`${label} ${shade}`}>
            <span className={`text-[8px] font-semibold ${["50", "100", "500"].includes(shade) ? "text-ink-700" : "text-white/90"}`}>
              {shade}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BrandingForm({ initial }: { initial: BrandingState }) {
  const [primary, setPrimary] = useState(initial.primary);
  const [accent, setAccent] = useState(initial.accent);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validPrimary = /^#[0-9a-fA-F]{6}$/.test(primary);
  const validAccent = /^#[0-9a-fA-F]{6}$/.test(accent);
  const dirty =
    primary.toUpperCase() !== initial.primary.toUpperCase() ||
    accent.toUpperCase() !== initial.accent.toUpperCase();

  async function saveColors() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await api<BrandingState>("/admin/branding", {
      method: "PUT",
      body: { primary: primary.toLowerCase(), accent: accent.toLowerCase() },
    });
    if (res.ok && res.data) {
      setPrimary(res.data.primary);
      setAccent(res.data.accent);
      setMsg("Brand colours saved — reload any open portal to see the new look.");
    } else {
      setErr(res.message || "Save failed.");
    }
    setBusy(false);
  }

  async function uploadLogo(file: File) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const fd = new FormData();
    fd.append("logo", file);
    const res = await apiUpload<BrandingState>("/admin/branding/logo", fd);
    if (res.ok && res.data) {
      setLogoUrl(res.data.logoUrl ? `${res.data.logoUrl}?v=${Date.now()}` : null);
      setMsg("Logo updated.");
    } else {
      setErr(res.message || "Upload failed — use PNG, JPG, WEBP or SVG up to 2 MB.");
    }
    if (fileRef.current) fileRef.current.value = "";
    setBusy(false);
  }

  async function removeLogo() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await api<BrandingState>("/admin/branding/logo", { method: "DELETE" });
    if (res.ok) {
      setLogoUrl(null);
      setMsg("Custom logo removed — the bundled default is in use.");
    } else {
      setErr(res.message || "Could not remove the logo.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      {msg && <Alert kind="success">{msg}</Alert>}
      {err && <Alert kind="error">{err}</Alert>}

      {/* ── Colours ─────────────────────────────────────────── */}
      <div className="grid gap-5 sm:grid-cols-2">
        <ColorField
          label="Primary colour"
          hint="Buttons, sidebar, links — the core of the institution's identity."
          value={primary}
          onChange={setPrimary}
        />
        <ColorField
          label="Accent colour"
          hint="Success actions and highlights (secondary brand colour)."
          value={accent}
          onChange={setAccent}
        />
      </div>

      {/* ── Presets ─────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
          Quick palettes
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                setPrimary(p.primary);
                setAccent(p.accent);
              }}
              title={p.name}
              className={`flex items-center gap-2 rounded-full border py-1.5 pl-2 pr-3 text-xs font-medium transition ${
                primary.toUpperCase() === p.primary && accent.toUpperCase() === p.accent
                  ? "border-brand-700 bg-brand-50 text-brand-900"
                  : "border-line-strong bg-white text-ink-600 hover:border-brand-500"
              }`}
            >
              <span className="flex">
                <span className="h-4 w-4 rounded-full border border-white" style={{ background: p.primary }} />
                <span className="-ml-1.5 h-4 w-4 rounded-full border border-white" style={{ background: p.accent }} />
              </span>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Derived-ramp preview ────────────────────────────── */}
      <div className="rounded-lg border border-line bg-slate-50/60 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
          Derived shades — applied automatically
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <RampPreview seed={validPrimary ? primary : "#777777"} label="Primary" />
          <RampPreview seed={validAccent ? accent : "#777777"} label="Accent" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={`btn-brand pointer-events-none ${validPrimary ? "" : "opacity-40"}`} style={{ background: validPrimary ? primary : undefined }}>
            Primary button
          </span>
          <span className="btn-accent pointer-events-none" style={{ background: validAccent ? accent : undefined }}>
            Accent button
          </span>
          <span className="surface-dark rounded-md px-3 py-2 text-xs font-semibold text-white" style={{ background: validPrimary ? mixToBlack(primary, 0.48) : undefined }}>
            Sidebar
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-brand btn-sm"
          onClick={saveColors}
          disabled={busy || !validPrimary || !validAccent || !dirty}
        >
          {busy ? "Saving…" : "Save brand colours"}
        </button>
        {dirty && (
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={() => {
              setPrimary(initial.primary);
              setAccent(initial.accent);
            }}
            disabled={busy}
          >
            Reset
          </button>
        )}
      </div>

      {/* ── Logo ────────────────────────────────────────────── */}
      <div className="border-t border-line pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
          Institution logo
        </p>
        <p className="mt-1 text-xs text-ink-400">
          Appears in every portal sidebar, the sign-in page, the public site and the browser tab. PNG, JPG, WEBP or SVG — up to 2 MB.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl ?? "/logo.png"}
            alt="Institution logo preview"
            className="h-14 w-auto rounded-md border border-line bg-white p-1.5"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadLogo(f);
            }}
          />
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            Upload new logo
          </button>
          {logoUrl && (
            <button type="button" className="btn-outline btn-sm" onClick={removeLogo} disabled={busy}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
