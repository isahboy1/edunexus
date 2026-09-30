import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { fail, handle, ok, notFound, HttpError, zodErrors } from "@/lib/api";
import { requireRole, AuthError } from "@/lib/auth";
import {
  personalInfoSchema,
  contactInfoSchema,
  jambSchema,
  olevelSchema,
  qualificationSchema,
} from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

async function ownedApplication(userId: string, applicationId: string) {
  const applicant = await prisma.applicant.findUnique({ where: { userId } });
  if (!applicant) throw new AuthError("Applicant profile not found", 404);
  const application = await prisma.application.findFirst({
    where: { id: applicationId, applicantId: applicant.id },
  });
  if (!application) throw notFound("Application not found");
  return application;
}

// GET /api/v1/applicant/applications/{id}
export async function GET(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await requireRole("APPLICANT");
    const { id } = await ctx.params;
    const application = await ownedApplication(session.id, id);
    const full = await prisma.application.findUnique({
      where: { id: application.id },
      include: {
        applicant: true,
        programme: { select: { id: true, name: true, code: true, award: true } },
        academicSession: { select: { id: true, name: true } },
        jambResult: { include: { subjects: true } },
        olevelResults: { include: { subjects: true } },
        qualifications: true,
        documents: true,
        payments: { orderBy: { createdAt: "desc" } },
        admission: true,
      },
    });
    return ok({ application: full });
  });
}

// PATCH /api/v1/applicant/applications/{id} — save a wizard section
// Body: { section: "personal"|"contact"|"jamb"|"olevel"|"qualification", ...data }
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await requireRole("APPLICANT");
    const { id } = await ctx.params;
    const application = await ownedApplication(session.id, id);

    // Submitted applications are locked (SRS §15)
    if (application.status !== "DRAFT" && application.status !== "PAYMENT_PENDING" && application.status !== "PAID") {
      throw new HttpError("This application has been submitted and can no longer be modified", 409);
    }

    const body = (await req.json().catch(() => null)) as { section?: string } | null;
    const section = body?.section;
    const payload = { ...body } as Record<string, unknown>;
    delete payload.section;
    if (!section) return fail("Validation failed", 422, { section: ["Section is required"] });


    switch (section) {
      case "personal": {
        const parsed = personalInfoSchema.safeParse(payload);
        if (!parsed.success) return fail("Validation failed", 422, zodErrors(parsed));
        const d = parsed.data;
        await prisma.applicant.update({
          where: { id: application.applicantId },
          data: {
            surname: d.surname,
            firstName: d.firstName,
            middleName: d.middleName || null,
            dateOfBirth: new Date(d.dateOfBirth),
            gender: d.gender,
            nationality: d.nationality,
            stateOfOrigin: d.stateOfOrigin,
            lga: d.lga,
            address: d.residentialAddress,
          },
        });
        await prisma.application.update({
          where: { id: application.id },
          data: { maritalStatus: d.maritalStatus, religion: d.religion || null },
        });
        // BIODATA stage saves in one go (official AKCILS flow)
        await prisma.application.update({
          where: { id: application.id },
          data: {
            permanentAddress: d.permanentAddress,
            emergencyContactName: d.emergencyContactName,
            emergencyContactPhone: d.emergencyContactPhone,
          },
        });
        // Keep user.name in sync
        await prisma.user.update({
          where: { id: session.id },
          data: { name: `${d.surname} ${d.firstName}` },
        });
        return ok({ saved: "personal" }, "Personal information saved");
      }
      case "contact": {
        const parsed = contactInfoSchema.safeParse(payload);
        if (!parsed.success) return fail("Validation failed", 422, zodErrors(parsed));
        const d = parsed.data;
        await prisma.application.update({
          where: { id: application.id },
          data: {
            permanentAddress: d.permanentAddress,
            currentDateAddress: d.currentDateAddress,
            emergencyContactName: d.emergencyContactName,
            emergencyContactPhone: d.emergencyContactPhone,
            emergencyContactAddress: d.emergencyContactAddress || null,
          },
        });
        return ok({ saved: "contact" }, "Contact information saved");
      }
      case "jamb": {
        const parsed = jambSchema.safeParse(payload);
        if (!parsed.success) return fail("Validation failed", 422, zodErrors(parsed));
        const d = parsed.data;
        await prisma.jambResult.upsert({
          where: { applicationId: application.id },
          update: {
            registrationNumber: d.registrationNumber,
            examinationYear: d.examinationYear,
            utmeScore: d.utmeScore ?? null,
            institutionChoice: d.institutionChoice || null,
          },
          create: {
            applicationId: application.id,
            registrationNumber: d.registrationNumber,
            examinationYear: d.examinationYear,
            utmeScore: d.utmeScore ?? null,
            institutionChoice: d.institutionChoice || null,
          },
        });
        const jamb = await prisma.jambResult.findUnique({ where: { applicationId: application.id } });
        if (jamb) {
          await prisma.jambSubject.deleteMany({ where: { jambResultId: jamb.id } });
          if (d.subjects?.length) {
            await prisma.jambSubject.createMany({
              data: d.subjects.map((s) => ({ jambResultId: jamb.id, subject: s.subject, score: s.score })),
            });
          }
        }
        return ok({ saved: "jamb" }, "JAMB information saved");
      }
      case "olevel": {
        const parsed = olevelSchema.safeParse(payload);
        if (!parsed.success) return fail("Validation failed", 422, zodErrors(parsed));
        const d = parsed.data;
        // Key on sitting number so First and Second sittings are separate records
        const existing = await prisma.olevelResult.findFirst({
          where: { applicationId: application.id, sittingNumber: d.sittingNumber },
        });
        const result =
          existing ??
          (await prisma.olevelResult.create({
            data: {
              applicationId: application.id,
              examinationType: d.examinationType,
              examinationNumber: d.examinationNumber,
              examinationYear: d.examinationYear,
              sittingNumber: d.sittingNumber,
            },
          }));
        await prisma.olevelSubject.deleteMany({ where: { olevelResultId: result.id } });
        await prisma.olevelSubject.createMany({
          data: d.subjects.map((s) => ({ olevelResultId: result.id, subject: s.subject, grade: s.grade })),
        });
        return ok({ saved: "olevel" }, "O-Level results saved");
      }
      case "qualification": {
        const parsed = qualificationSchema.safeParse(payload);
        if (!parsed.success) return fail("Validation failed", 422, zodErrors(parsed));
        const d = parsed.data;
        await prisma.applicationQualification.create({
          data: {
            applicationId: application.id,
            qualification: d.qualification,
            institution: d.institution,
            certificate: d.certificate || null,
            gradeClass: d.gradeClass || null,
            year: d.year,
          },
        });
        return ok({ saved: "qualification" }, "Qualification added");
      }
      default:
        return fail("Validation failed", 422, { section: ["Unknown section"] });
    }
  });
}
