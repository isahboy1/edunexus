import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { created, fail, handle, HttpError } from "@/lib/api";
import { setSessionCookie, recordAudit, type RoleName } from "@/lib/auth";
import { registerSchema } from "@/lib/validators";
import { notifyUser } from "@/lib/notify";

// POST /api/v1/auth/register — applicant account creation (SRS FR-001)
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "form";
        (errors[key] ??= []).push(issue.message);
      }
      return fail("Validation failed", 422, errors);
    }
    const data = parsed.data;
    const email = data.email.toLowerCase().trim();

    // Prevent duplicate accounts
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return fail("Validation failed", 422, {
        email: ["An account with this email already exists. Please login instead."],
      });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const applicantRole = await prisma.role.findUnique({ where: { name: "APPLICANT" } });
    if (!applicantRole) throw new HttpError("System roles are not initialised. Run the seed script.", 500);

    const seq = await prisma.applicant.count();
    const user = await prisma.user.create({
      data: {
        name: `${data.surname} ${data.firstName}`,
        email,
        phone: data.phone,
        passwordHash,
        userRoles: { create: [{ roleId: applicantRole.id }] },
        applicant: {
          create: {
            surname: data.surname,
            firstName: data.firstName,
            middleName: data.middleName || null,
            applicationNumber: `APP-REG-${String(seq + 1).padStart(6, "0")}`,
          },
        },
      },
      include: { applicant: true, userRoles: { include: { role: true } } },
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
      action: "REGISTER",
      entityType: "User",
      entityId: user.id,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    await notifyUser({
      userId: user.id,
      subject: "Welcome to EDUNEXUS",
      body: `Dear ${data.firstName}, your EDUNEXUS applicant account has been created successfully. You can now start your admission application.`,
    });

    return created(sessionUser, "Account created successfully");
  });
}
