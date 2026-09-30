import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Loader for the SHARED demo-credentials file (edunexus/seed-credentials.json).
 *
 * That file is the single source of truth for staff demo accounts across both
 * seeders — the Laravel DatabaseSeeder and the Next Prisma seed both read it,
 * so the two apps' demo logins can never drift apart. Extracted here so the
 * loading/validation rules are unit-testable and prisma/seed.ts stays thin.
 */

export interface SeedCredential {
  email: string;
  name: string;
  role: string;
}

export interface SeedCredentials {
  defaultPassword: string;
  staff: SeedCredential[];
}

export function readSeedCredentials(dir: string, filename = "seed-credentials.json"): SeedCredentials {
  return parseSeedCredentials(readFileSync(join(dir, filename), "utf8"));
}

export function parseSeedCredentials(raw: string): SeedCredentials {
  const parsed = JSON.parse(raw) as Partial<SeedCredentials>;
  if (typeof parsed.defaultPassword !== "string" || parsed.defaultPassword.length === 0) {
    throw new Error("seed-credentials.json: missing non-empty \"defaultPassword\"");
  }
  if (!Array.isArray(parsed.staff) || parsed.staff.length === 0) {
    throw new Error("seed-credentials.json: \"staff\" must be a non-empty array");
  }
  const seen = new Set<string>();
  for (const member of parsed.staff) {
    for (const field of ["email", "name", "role"] as const) {
      const value = member?.[field];
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(`seed-credentials.json: staff entry missing "${field}"`);
      }
    }
    const key = member.email.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`seed-credentials.json: duplicate staff email "${member.email}"`);
    }
    seen.add(key);
  }
  return parsed as SeedCredentials;
}

/**
 * Resolve the effective password: SEED_ADMIN_PASSWORD env overrides the file's
 * defaultPassword (mirrors prisma/seed.ts). Throws when neither is set.
 */
export function resolveSeedPassword(
  credentials: Pick<SeedCredentials, "defaultPassword">,
  envOverride?: string
): string {
  const password = envOverride ?? credentials.defaultPassword;
  if (!password) throw new Error("No seed password available");
  return password;
}

/** Look up a staff entry by email (case-insensitive), or throw. */
export function requireStaffEntry(credentials: SeedCredentials, email: string): SeedCredential {
  const entry = credentials.staff.find((s) => s.email.toLowerCase() === email.toLowerCase());
  if (!entry) {
    throw new Error(`seed-credentials.json: no staff entry for ${email}`);
  }
  return entry;
}
