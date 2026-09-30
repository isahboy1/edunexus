import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handle, ok, notFound } from "@/lib/api";
import { requireRole } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/admin/applications/{id} — full dossier for review (SRS §18)
export async function GET(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireRole(
      "SUPER_ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER", "ACADEMIC_OFFICER", "HOD"
    );
    const { id } = await ctx.params;
    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        applicant: true,
        programme: true,
        entryLevel: true,
        academicSession: true,
        jambResult: { include: { subjects: true } },
        olevelResults: { include: { subjects: true } },
        qualifications: true,
        documents: true,
        payments: { orderBy: { createdAt: "desc" } },
        admission: true,
      },
    });
    if (!application) throw notFound("Application not found");
    return ok({ application });
  });
}
