import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { created, fail, handle, ok } from "@/lib/api";
import { requireRole, recordAudit, type RoleName } from "@/lib/auth";
import { z } from "zod";

/**
 * Privilege model (SRS RBAC):
 *  - SUPER_ADMIN: full access — may create any role and manage any account.
 *  - ADMIN (sub-admin): limited to user management — create users and reset
 *    passwords — restricted to non-privileged accounts. Sub-admins can never
 *    mint or touch SUPER_ADMIN, ADMIN or REGISTRAR accounts.
 */
const SUB_ADMIN_ASSIGNABLE: RoleName[] = [
  "ADMISSIONS_OFFICER",
  "ACADEMIC_OFFICER",
  "BURSARY_OFFICER",
  "HOD",
  "LECTURER",
];
const PROTECTED_ROLES: RoleName[] = ["SUPER_ADMIN", "ADMIN", "REGISTRAR"];

const createSchema = z.object({
  name: z.string().min(2).max(150),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  password: z.string().min(8),
  roles: z.array(z.string()).min(1),
});

/** True when the actor holds the ADMIN role only (no SUPER_ADMIN, etc.). */
function isSubAdminOnly(roles: RoleName[]): boolean {
  return roles.length > 0 && roles.every((r) => r === "ADMIN");
}

// GET /api/v1/admin/users — user directory for both admin tiers.
// Sub-admins only see non-privileged accounts (their scope of work).
export async function GET() {
  return handle(async () => {
    const admin = await requireRole("SUPER_ADMIN", "ADMIN");
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      where: isSubAdminOnly(admin.roles)
        ? { userRoles: { none: { role: { name: { in: PROTECTED_ROLES as never[] } } } } }
        : undefined,
      select: {
        id: true, name: true, email: true, phone: true, status: true,
        lastLoginAt: true, createdAt: true,
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });
    return ok({
      users: users.map((u) => ({ ...u, roles: u.userRoles.map((r) => r.role.name) })),
    });
  });
}

// POST /api/v1/admin/users — create a staff user
export async function POST(req: NextRequest) {
  return handle(async () => {
    const admin = await requireRole("SUPER_ADMIN", "ADMIN");
    const subOnly = isSubAdminOnly(admin.roles);
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "form";
        (errors[key] ??= []).push(issue.message);
      }
      return fail("Validation failed", 422, errors);
    }
    const { name, email, phone, password, roles } = parsed.data;

    // Privilege-escalation guard: a sub-admin can only mint non-privileged roles.
    if (subOnly && roles.some((r) => !SUB_ADMIN_ASSIGNABLE.includes(r as RoleName))) {
      return fail("Insufficient permissions", 403);
    }

    const normalized = email.toLowerCase().trim();
    const exists = await prisma.user.findUnique({ where: { email: normalized } });
    if (exists) return fail("Validation failed", 422, { email: ["Email already in use"] });

    const roleRows = await prisma.role.findMany({ where: { name: { in: roles as never[] } } });
    if (roleRows.length === 0) return fail("Validation failed", 422, { roles: ["No valid roles supplied"] });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name,
        email: normalized,
        phone,
        passwordHash,
        userRoles: { create: roleRows.map((r) => ({ roleId: r.id })) },
      },
      select: { id: true, name: true, email: true },
    });

    await recordAudit({
      userId: admin.id,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      newValues: { email: normalized, roles },
    });

    return created({ user }, "Staff user created");
  });
}
