import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { requireRole, AuthError } from "@/lib/auth";

// GET /api/v1/applicant/admission-status
export async function GET() {
  return handle(async () => {
    const session = await requireRole("APPLICANT");
    const applicant = await prisma.applicant.findUnique({ where: { userId: session.id } });
    if (!applicant) throw new AuthError("Applicant profile not found", 404);

    const applications = await prisma.application.findMany({
      where: { applicantId: applicant.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        applicationNumber: true,
        status: true,
        paymentStatus: true,
        submittedAt: true,
        decidedAt: true,
        decisionComments: true,
        programme: { select: { name: true, code: true, award: true } },
        academicSession: { select: { name: true } },
        admission: {
          select: {
            id: true,
            admissionNumber: true,
            status: true,
            offeredAt: true,
            acceptedAt: true,
            offerConditions: true,
          },
        },
      },
    });
    return ok({ applications });
  });
}
