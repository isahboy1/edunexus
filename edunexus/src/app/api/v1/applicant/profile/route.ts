import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { fail, handle, ok } from "@/lib/api";
import { requireRole, AuthError } from "@/lib/auth";

async function currentApplicant(userId: string) {
  const applicant = await prisma.applicant.findUnique({ where: { userId } });
  if (!applicant) throw new AuthError("Applicant profile not found", 404);
  return applicant;
}

// GET /api/v1/applicant/profile
export async function GET() {
  return handle(async () => {
    const session = await requireRole("APPLICANT", "STUDENT");
    const applicant = await currentApplicant(session.id);
    return ok({ applicant });
  });
}

// PATCH /api/v1/applicant/profile — update permitted personal information
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const session = await requireRole("APPLICANT");
    const applicant = await currentApplicant(session.id);
    const body = await req.json().catch(() => ({}));

    const allowed = [
      "middleName", "dateOfBirth", "gender", "nationality", "stateOfOrigin",
      "lga", "address",
    ] as const;
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) data[key] = body[key] || null;
    }
    if (data.dateOfBirth && typeof data.dateOfBirth === "string") {
      data.dateOfBirth = new Date(data.dateOfBirth);
    }
    const updated = await prisma.applicant.update({ where: { id: applicant.id }, data });
    return ok({ applicant: updated }, "Profile updated");
  });
}
