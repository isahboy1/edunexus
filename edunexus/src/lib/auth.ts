import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import type { RoleName as PrismaRoleName } from "@/generated/prisma/enums";
import { LARAVEL_API_URL, TOKEN_COOKIE } from "@/lib/laravel";

export const SESSION_COOKIE = "edunexus_session";
const DEFAULT_SESSION_HOURS = 12;

// Re-use the enum type generated from the schema
export type RoleName = PrismaRoleName;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  roles: RoleName[];
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is not configured (set it in .env)");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const hours = Number(process.env.SESSION_HOURS ?? DEFAULT_SESSION_HOURS);
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${hours}h`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.id || !Array.isArray(payload.roles)) return null;
    return {
      id: String(payload.id),
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      roles: payload.roles as RoleName[],
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser) {
  const token = await createSessionToken(user);
  const hours = Number(process.env.SESSION_HOURS ?? DEFAULT_SESSION_HOURS);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: hours * 3600,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Resolve the signed-in user for server components and Next API routes.
 *
 * Primary source: the Laravel Sanctum bearer token cookie set at login
 * (frontend calls the Laravel API). Falls back to the legacy Next.js JWT
 * cookie so the bundled Next API routes (and scripts/smoke.mjs) keep working.
 * Wrapped in React cache() so a render pass performs at most one lookup.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();

  const sanctum = store.get(TOKEN_COOKIE)?.value;
  if (sanctum) {
    try {
      const res = await fetch(`${LARAVEL_API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${sanctum}` },
        cache: "no-store",
      });
      if (res.ok) {
        const json = (await res.json()) as {
          data?: { id?: string; name?: string; email?: string; roles?: string[] };
        };
        const d = json.data;
        if (d?.id && Array.isArray(d.roles)) {
          return {
            id: d.id,
            name: d.name ?? "",
            email: d.email ?? "",
            roles: d.roles as RoleName[],
          };
        }
      } else if (res.status === 401) {
        // Token expired/revoked — ignore it and try the legacy cookie.
      }
    } catch (err) {
      console.error("[auth] Laravel /auth/me failed", err);
    }
  }

  const legacy = store.get(SESSION_COOKIE)?.value;
  if (!legacy) return null;
  return verifySessionToken(legacy);
});

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Administrator",
  ADMIN: "Administrator (Sub-Admin)",
  REGISTRAR: "Registrar",
  ADMISSIONS_OFFICER: "Admissions Officer",
  ACADEMIC_OFFICER: "Academic Officer",
  BURSARY_OFFICER: "Bursary Officer",
  HOD: "Head of Department",
  LECTURER: "Lecturer",
  APPLICANT: "Applicant",
  STUDENT: "Student",
};

/** Human-readable label for the signed-in user's most senior role. */
export function primaryRoleLabel(roles: string[]): string {
  const priority: RoleName[] = [
    "SUPER_ADMIN",
    "ADMIN",
    "REGISTRAR",
    "ADMISSIONS_OFFICER",
    "ACADEMIC_OFFICER",
    "BURSARY_OFFICER",
    "HOD",
    "LECTURER",
    "STUDENT",
    "APPLICANT",
  ];
  const found = priority.find((r) => roles.includes(r));
  return found ? ROLE_LABELS[found] : "Member";
}

export function hasRole(user: SessionUser | null, ...roles: RoleName[]): boolean {
  if (!user) return false;
  return user.roles.some((r) => roles.includes(r));
}

export function hasAnyRole(user: SessionUser | null): boolean {
  return hasRole(
    user,
    "SUPER_ADMIN",
    "ADMIN",
    "REGISTRAR",
    "ADMISSIONS_OFFICER",
    "ACADEMIC_OFFICER",
    "BURSARY_OFFICER"
  );
}

/**
 * Privilege tiers:
 *  - SUPER_ADMIN: every privilege across the system.
 *  - ADMIN (sub-admin): limited to user management — creating users and
 *    resetting user passwords. Explicitly excluded from admissions, settings
 *    and audit surfaces.
 */
export const SUB_ADMIN_ONLY_ROLE: RoleName = "ADMIN";

export function isSuperAdmin(user: SessionUser | null): boolean {
  return hasRole(user, "SUPER_ADMIN");
}

/** Sub-admin with ONLY the user-management role (no other staff roles). */
export function isSubAdminOnly(user: SessionUser | null): boolean {
  if (!user) return false;
  return user.roles.length > 0 && user.roles.every((r) => r === "ADMIN");
}

/** True when the user may create users / reset passwords. */
export function canManageUsers(user: SessionUser | null): boolean {
  return hasRole(user, "SUPER_ADMIN", "ADMIN");
}

// Full authorization helper for API routes
export async function requireRole(...roles: RoleName[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Authentication required", 401);
  if (!hasRole(user, ...roles)) throw new AuthError("Insufficient permissions", 403);
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Persist audit entry (best-effort; never blocks the main flow)
export async function recordAudit(params: {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? undefined,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        oldValues: params.oldValues === undefined ? undefined : (params.oldValues as object),
        newValues: params.newValues === undefined ? undefined : (params.newValues as object),
        ipAddress: params.ipAddress,
        userAgent: params.userAgent?.slice(0, 300),
      },
    });
  } catch (e) {
    console.error("[audit] failed to record", params.action, e);
  }
}
