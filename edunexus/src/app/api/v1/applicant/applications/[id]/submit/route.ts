import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handle, ok, notFound, HttpError } from "@/lib/api";
import { requireRole, recordAudit, AuthError } from "@/lib/auth";
import { notifyUser } from "@/lib/notify";

type Ctx = { params: Promise<{ id: string }> };

const REQUIRED_DOCS = ["PASSPORT", "OLEVEL_RESULT"] as const;

// POST /api/v1/applicant/applications/{id}/submit
// Business rules (SRS §57): paid + complete + declaration acknowledged.
export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await requireRole("APPLICANT");
    const { id } = await ctx.params;
    const applicant = await prisma.applicant.findUnique({ where: { userId: session.id } });
    if (!applicant) throw new AuthError("Applicant profile not found", 404);
    const application = await prisma.application.findFirst({
      where: { id, applicantId: applicant.id },
      include: {
        documents: true,
        jambResult: true,
        olevelResults: { include: { subjects: true } },
      },
    });
    if (!application) throw notFound("Application not found");

    if (application.status === "SUBMITTED" || application.status === "UNDER_REVIEW") {
      throw new HttpError("Application has already been submitted", 409);
    }
    if (application.status === "ADMITTED") {
      throw new HttpError("Application has already been decided", 409);
    }

    // Rule 1: application must be paid
    const successfulPayment = await prisma.applicationPayment.findFirst({
      where: { applicationId: application.id, status: "SUCCESSFUL" },
    });
    if (!successfulPayment) {
      throw new HttpError("You must complete the application fee payment before submitting", 402);
    }

    // Rule 2: mandatory fields — personal info on applicant record
    const profile = await prisma.applicant.findUnique({ where: { id: application.applicantId } });
    const missing: string[] = [];
    if (!profile?.dateOfBirth) missing.push("Date of birth (Section A)");
    if (!profile?.gender) missing.push("Gender (Section A)");
    if (!profile?.stateOfOrigin) missing.push("State of origin (Section A)");
    if (!profile?.address) missing.push("Residential address (Section A)");
    if (missing.length) {
      throw new HttpError(`Complete Section A (Personal Information) first. Missing: ${missing.join(", ")}`, 422);
    }

    // Rule 3: mandatory documents present
    for (const t of REQUIRED_DOCS) {
      const has = application.documents.some((d) => d.documentType === t);
      if (!has) {
        throw new HttpError(
          `Missing required document: ${t === "PASSPORT" ? "Passport photograph" : "O-Level result"}`,
          422
        );
      }
    }

    // Rule 4: at least one O-Level result with subjects
    const olevelWithSubjects = application.olevelResults.filter((r) => r.subjects.length > 0);
    if (olevelWithSubjects.length === 0) {
      throw new HttpError("Enter your O-Level results with subjects and grades (Section E)", 422);
    }

    // Rule 5: JAMB record for UTME-type applications
    if (application.applicationType === "UTME" && !application.jambResult) {
      throw new HttpError("UTME applicants must provide JAMB information (Section D)", 422);
    }

    const updated = await prisma.application.update({
      where: { id: application.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });

    await recordAudit({
      userId: session.id,
      action: "APPLICATION_SUBMITTED",
      entityType: "Application",
      entityId: application.id,
      newValues: { applicationNumber: application.applicationNumber },
    });

    await notifyUser({
      userId: session.id,
      subject: "Application submitted successfully",
      body: `Dear ${profile?.firstName ?? "Applicant"}, your application ${application.applicationNumber} has been submitted successfully. You can download your acknowledgement slip from your dashboard and track your admission status.`,
    });

    return ok({ application: updated }, "Application submitted successfully");
  });
}
