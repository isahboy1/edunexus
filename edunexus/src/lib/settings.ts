import { prisma } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";
import { DEFAULT_BRANDING, type Branding, normalizeHex } from "@/lib/branding";

// Admin-configurable settings (SRS §58: routine changes must not need a developer)

export interface InstitutionSettings {
  name: string;
  shortName: string;
  domain: string;
  address: string;
  email: string;
  phone: string;
  matricPrefix: string;
  admissionPrefix: string;
}

const INSTITUTION_KEY = "institution";

const DEFAULT_INSTITUTION: InstitutionSettings = {
  name: "EduNexus College",
  shortName: "EduNexus",
  domain: "edunexus.edu.ng",
  address: "BUK Road, Kano, Kano State",
  email: "info@edunexus.edu.ng",
  phone: "+234 800 000 0000",
  matricPrefix: "EDU",
  admissionPrefix: "EDU/ADM",
};

export async function getInstitutionSettings(): Promise<InstitutionSettings> {
  // Primary source: the Laravel API (admin settings write here now).
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";
    const res = await fetch(`${base}/public/settings`, { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { data?: Partial<InstitutionSettings> & { branding?: unknown } };
      if (json.data && typeof json.data === "object") {
        const inst = { ...json.data };
        delete inst.branding; // consumed by getBranding()
        return { ...DEFAULT_INSTITUTION, ...inst };
      }
    }
  } catch {
    // fall through to legacy sources
  }
  // Legacy fallback: the Next.js database.
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: INSTITUTION_KEY } });
    if (row) return { ...DEFAULT_INSTITUTION, ...(row.value as Partial<InstitutionSettings>) };
  } catch {
    // fall through to defaults
  }
  return DEFAULT_INSTITUTION;
}

const FALLBACK_LOGO = "/logo.png";

/**
 * White-label branding for the current deployment: brand seed colours and the
 * resolved logo URL. Read from the Laravel API (single source of truth written
 * by the admin Branding studio); falls back to the bundled design system.
 */
export async function getBranding(): Promise<Branding> {
  // White-labeling must be LIVE: opting this read out of any cache makes every
  // route that consumes branding (root layout → all pages) render per request,
  // so a colour change never waits for a rebuild or a stale cache.
  noStore();
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";
    const res = await fetch(`${base}/public/settings`, { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { branding?: { primary?: string; accent?: string; logoUrl?: string | null } };
      };
      const b = json.data?.branding;
      if (b) {
        return {
          primary: normalizeHex(b.primary ?? "") ?? DEFAULT_BRANDING.primary,
          accent: normalizeHex(b.accent ?? "") ?? DEFAULT_BRANDING.accent,
          logoUrl: typeof b.logoUrl === "string" && b.logoUrl ? b.logoUrl : null,
        };
      }
    }
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULT_BRANDING };
}

/** Logo URL a header/nav should render: custom crest or the bundled default. */
export function resolveLogoUrl(branding: Branding): string {
  return branding.logoUrl ?? FALLBACK_LOGO;
}

export async function updateInstitutionSettings(patch: Partial<InstitutionSettings>) {
  const current = await getInstitutionSettings();
  const value = { ...current, ...patch };
  await prisma.systemSetting.upsert({
    where: { key: INSTITUTION_KEY },
    update: { value: value as object },
    create: { key: INSTITUTION_KEY, value: value as object },
  });
  return value;
}

export interface AdmissionWindowSettings {
  applicationFee: number;
  currency: string;
  opensAt: string | null;
  closesAt: string | null;
  isActive: boolean;
}

// Application-window configuration per academic session (fee, deadline, active flag)
export async function getAdmissionWindow(sessionId: string): Promise<AdmissionWindowSettings | null> {
  const s = await prisma.applicationSetting.findUnique({ where: { academicSessionId: sessionId } });
  if (!s) return null;
  return {
    applicationFee: Number(s.applicationFee),
    currency: s.currency,
    opensAt: s.opensAt?.toISOString() ?? null,
    closesAt: s.closesAt?.toISOString() ?? null,
    isActive: s.isActive,
  };
}

// Guard used when starting/paying for an application
export async function assertApplicationWindowOpen(sessionId: string): Promise<void> {
  const win = await getAdmissionWindow(sessionId);
  if (!win) throw new Error("Admission configuration for this session is not available");
  if (!win.isActive) throw new Error("Applications are currently closed for this session");
  const now = Date.now();
  if (win.opensAt && new Date(win.opensAt).getTime() > now)
    throw new Error("Applications have not opened yet for this session");
  if (win.closesAt && new Date(win.closesAt).getTime() < now)
    throw new Error("The application deadline for this session has passed");
}

// Unique reference generator: EDU-APP-<timestamp base36>-<rand>
export function generatePaymentReference(prefix = "EDU-APP"): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function generateApplicationNumber(sessionName: string, seq: number): string {
  const year = sessionName.split("/")[0] ?? String(new Date().getFullYear());
  return `APP-${year}-${String(seq).padStart(6, "0")}`;
}

export function generateAdmissionNumber(prefix: string, sessionName: string, seq: number): string {
  const year = sessionName.split("/")[0] ?? String(new Date().getFullYear());
  return `${prefix}/${year}/${String(seq).padStart(5, "0")}`;
}

export function generateMatricNumber(prefix: string, sessionName: string, seq: number): string {
  const year = sessionName.split("/")[0] ?? String(new Date().getFullYear());
  return `${prefix}/${year}/${String(seq).padStart(5, "0")}`;
}
