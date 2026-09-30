import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { fail, handle, ok } from "@/lib/api";
import { requireRole, recordAudit } from "@/lib/auth";

/**
 * POST /api/v1/admin/users/[id]/reset-password
 *
 * Super Admin: may reset any account's password.
 * Admin (sub-admin): may reset passwords of non-privileged users only —
 * never SUPER_ADMIN, ADMIN or REGISTRAR accounts, and never their own.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireRole("SUPER_ADMIN", "ADMIN");
    const { id } = await ctx.params;

    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true,
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!target) return fail("User not found", 404);

    // Body: { newPassword } — validated against Laravel's password policy.
    const body = (await req.json().catch(() => null)) as { newPassword?: string } | null;
    const newPassword = body?.newPassword;
    if (typeof newPassword !== "string" || newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return fail("Validation failed", 422, {
        newPassword: ["Password must be at least 8 characters and contain letters and numbers"],
      });
    }

    const targetRoles = target.userRoles.map((r) => r.role.name);
    const actorIsSubOnly = actor.roles.length > 0 && actor.roles.every((r) => r === "ADMIN");

    if (target.id === actor.id) {
      return fail("Use account settings to change your own password", 422, {
        form: ["You cannot reset your own password here"],
      });
    }
    if (actorIsSubOnly && targetRoles.some((r) => ["SUPER_ADMIN", "ADMIN", "REGISTRAR"].includes(r))) {
      return fail("Insufficient permissions", 403);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: target.id },
        data: {
          passwordHash,
          failedLogins: 0,
          lockedUntil: null,
        },
      }),
    ]);

    await recordAudit({
      userId: actor.id,
      action: "PASSWORD_RESET",
      entityType: "User",
      entityId: target.id,
      newValues: { email: target.email },
    });

    return ok({ reset: true }, "Password reset. Share it with the user securely.");
  });
}
