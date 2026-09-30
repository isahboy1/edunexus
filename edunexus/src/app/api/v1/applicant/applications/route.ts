import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { created, fail, handle, ok, HttpError } from "@/lib/api";
import { requireRole, recordAudit, AuthError } from "@/lib/auth";
import { programmeSchema } from "@/lib/validators";
import {
  assertApplicationWindowOpen,
  generateApplicationNumber,
} from "@/lib/settings";

// GET /api/v1/applicant/applications
export async function GET() {
  return handle(async () => {
    const session = await requireRole("APPLICANT");
    const applicant = await prisma.applicant.findUnique({ where: { userId: session.id } });
    if (!applicant) throw new AuthError("Applicant profile not found", 404);
    const applications = await prisma.application.findMany({
      where: { applicantId: applicant.id },
      orderBy: { createdAt: "desc" },
      include: {
        programme: { select: { name: true, code: true, award: true } },
        academicSession: { select: { name: true } },
      },
    });
    return ok({ applications });
  });
}

// POST /api/v1/applicant/applications — start a new application (creates DRAFT)
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireRole("APPLICANT");
    const applicant = await prisma.applicant.findUnique({ where: { userId: session.id } });
    if (!applicant) throw new AuthError("Applicant profile not found", 404);

    const body = await req.json().catch(() => null);
    const parsed = programmeSchema.safeParse(body);
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "form";
        (errors[key] ??= []).push(issue.message);
      }
      return fail("Validation failed", 422, errors);
    }
    const input = parsed.data;

    // The current academic session is the admission target
    const sessionRow = await prisma.academicSession.findFirst({
      where: { isCurrent: true },
    });
    if (!sessionRow) throw new HttpError("No active academic session configured", 400);
    await assertApplicationWindowOpen(sessionRow.id);

    // Programme must exist and be open for applications
    const programme = await prisma.programme.findUnique({ where: { id: input.programmeId } });
    if (!programme || programme.status !== "ACTIVE") throw new HttpError("Selected programme is not available", 400);

    // Only active application types are allowed (admin-configured)
    const appSetting = await prisma.applicationSetting.findUnique({
      where: { academicSessionId: sessionRow.id },
    });
    const allowedTypes = (appSetting?.allowedTypes as string[] | null) ?? null;
    if (allowedTypes && !allowedTypes.includes(input.applicationType)) {
      return fail("Validation failed", 422, {
        applicationType: ["This application type is not currently offered"],
      });
    }

    // One active application per applicant per session (SRS §57)
    const existing = await prisma.application.findFirst({
      where: {
        applicantId: applicant.id,
        academicSessionId: sessionRow.id,
        status: { notIn: ["REJECTED", "WITHDRAWN"] },
      },
    });
    if (existing) {
      return fail("You already have an active application for this session.", 409, {
        application: ["Only one active application per session is allowed"],
      });
    }

    const seq = await prisma.application.count();
    const application = await prisma.application.create({
      data: {
        applicationNumber: generateApplicationNumber(sessionRow.name, seq + 1),
        applicantId: applicant.id,
        academicSessionId: sessionRow.id,
        programmeId: input.programmeId,
        applicationType: input.applicationType,
        studyMode: input.studyMode,
        entryLevelValue: input.entryLevelValue ?? null,
        firstChoiceProgrammeId: input.firstChoiceProgrammeId ?? null,
        secondChoiceProgrammeId: input.secondChoiceProgrammeId ?? null,
        status: "DRAFT",
      },
    });

    await recordAudit({
      userId: session.id,
      action: "APPLICATION_CREATED",
      entityType: "Application",
      entityId: application.id,
      newValues: { applicationNumber: application.applicationNumber },
    });

    return created({ application }, "Application created");
  });
}
