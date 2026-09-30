import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { fail, handle, ok, HttpError } from "@/lib/api";
import { setSessionCookie, recordAudit, type RoleName } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

// POST /api/v1/auth/login — email + password, with lockout after repeated failures
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return fail("Validation failed", 422, { form: ["Invalid credentials format"] });
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) return fail("Invalid email or password", 401);

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return fail("Account temporarily locked due to failed attempts. Try again later.", 423);
    }
    if (user.status !== "ACTIVE") return fail("This account is not active. Contact the administrator.", 403);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const failedLogins = user.failedLogins + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins,
          lockedUntil:
            failedLogins >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      return fail("Invalid email or password", 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const sessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.userRoles.map((r) => r.role.name as RoleName),
    };
    await setSessionCookie(sessionUser);

    await recordAudit({
      userId: user.id,
      action: "LOGIN",
      entityType: "User",
      entityId: user.id,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    // Landing route depends on highest-privilege role
    const staffRoles: RoleName[] = [
      "SUPER_ADMIN",
      "ADMIN",
      "REGISTRAR",
      "ADMISSIONS_OFFICER",
      "ACADEMIC_OFFICER",
      "BURSARY_OFFICER",
      "HOD",
    ];
    let redirectTo = "/applicant/dashboard";
    if (sessionUser.roles.some((r) => staffRoles.includes(r))) redirectTo = "/admin/dashboard";
    else if (sessionUser.roles.includes("STUDENT")) redirectTo = "/student/dashboard";

    return ok({ user: sessionUser, redirectTo }, "Login successful");
  });
}
