import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { fail, handle, ok, notFound, HttpError } from "@/lib/api";
import { requireRole, recordAudit } from "@/lib/auth";
import { notifyUser } from "@/lib/notify";
import { generateAdmissionNumber, getInstitutionSettings } from "@/lib/settings";

type Ctx = { params: Promise<{ id: string }> };
type Action = "review" | "shortlist" | "screening" | "request_correction" | "admit" | "reject";

// POST /api/v1/admin/applications/{id}/actions — body: { action, comments? }
export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const staff = await requireRole(
      "SUPER_ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER"
    );
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as { action?: Action; comments?: string } | null;
    const action = body?.action;
    const comments = body?.comments?.trim() || null;
    if (!action) return fail("Validation failed", 422, { action: ["action is required"] });

    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        applicant: { include: { user: true } },
        programme: true,
        academicSession: true,
        admission: true,
      },
    });
    if (!application) throw notFound("Application not found");
    if (!["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "SCREENING"].includes(application.status)) {
      throw new HttpError(`Cannot ${action.replace("_", " ")} an application in status ${application.status}`, 409);
    }

    switch (action) {
      case "review":
        await prisma.application.update({
          where: { id },
          data: { status: "UNDER_REVIEW", reviewedAt: new Date(), reviewComments: comments },
        });
        break;
      case "shortlist":
        await prisma.application.update({
          where: { id },
          data: { status: "SHORTLISTED", reviewComments: comments },
        });
        break;
      case "screening":
        await prisma.application.update({
          where: { id },
          data: { status: "SCREENING", reviewComments: comments },
        });
        break;
      case "request_correction":
        // Reopen the application for the applicant (SRS §15)
        await prisma.application.update({
          where: { id },
          data: { status: "PAID", reviewComments: comments, reviewedAt: new Date() },
        });
        await notifyUser({
          userId: application.applicant.userId,
          subject: "Correction required on your application",
          body: `Dear ${application.applicant.firstName}, the admissions office requires a correction on your application ${application.applicationNumber}. ${comments ?? "Please review and resubmit."}`,
        });
        break;
      case "reject":
        await prisma.application.update({
          where: { id },
          data: { status: "REJECTED", decidedAt: new Date(), decisionComments: comments },
        });
        await notifyUser({
          userId: application.applicant.userId,
          subject: "Application decision",
          body: `Dear ${application.applicant.firstName}, we regret to inform you that your application ${application.applicationNumber} was not successful at this time. ${comments ?? ""}`,
        });
        break;
      case "admit": {
        if (application.admission) throw new HttpError("Admission already exists for this application", 409);
        const inst = await getInstitutionSettings();
        const seq = await prisma.admission.count();
        const admissionNumber = generateAdmissionNumber(inst.admissionPrefix, application.academicSession.name, seq + 1);

        const entryLevel = application.entryLevelValue ?? 100;
        const admission = await prisma.admission.create({
          data: {
            applicationId: application.id,
            admissionNumber,
            programmeId: application.programmeId,
            levelValue: entryLevel,
            academicSessionId: application.academicSessionId,
            status: "OFFERED",
            offerConditions: comments,
          },
        });
        await prisma.application.update({
          where: { id },
          data: { status: "ADMITTED", decidedAt: new Date(), decisionComments: comments },
        });
        await notifyUser({
          userId: application.applicant.userId,
          subject: "Congratulations — you have been offered admission!",
          body: `Dear ${application.applicant.firstName}, congratulations! You have been offered admission into ${application.programme.name} (${application.academicSession.name}). Admission Number: ${admissionNumber}. Log in to the portal to accept your offer.`,
        });
        return ok({ admission }, "Admission offered successfully");
      }
      default:
        return fail("Validation failed", 422, { action: ["Unknown action"] });
    }

    await recordAudit({
      userId: staff.id,
      action: `APPLICATION_${action.toUpperCase()}`,
      entityType: "Application",
      entityId: id,
      newValues: { action, comments },
    });

    return ok({ done: true }, "Action applied successfully");
  });
}
