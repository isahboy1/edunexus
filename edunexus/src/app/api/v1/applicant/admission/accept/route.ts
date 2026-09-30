import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { created, fail, handle, notFound, HttpError } from "@/lib/api";
import { requireRole, recordAudit, AuthError } from "@/lib/auth";
import { generateMatricNumber, getInstitutionSettings } from "@/lib/settings";
import { notifyUser } from "@/lib/notify";

// POST /api/v1/applicant/admission/accept — body: { admissionId }
// Student conversion (SRS §21): Admission → Student record + matric number.
// Must never create duplicate student records.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireRole("APPLICANT", "STUDENT");
    const body = (await req.json().catch(() => null)) as { admissionId?: string } | null;
    if (!body?.admissionId) {
      return fail("Validation failed", 422, { admissionId: ["admissionId is required"] });
    }

    const applicant = await prisma.applicant.findUnique({ where: { userId: session.id } });
    if (!applicant) throw new AuthError("Applicant profile not found", 404);

    const admission = await prisma.admission.findFirst({
      where: { id: body.admissionId, application: { applicantId: applicant.id } },
      include: { application: true, academicSession: true },
    });
    if (!admission) throw notFound("Admission offer not found");
    if (admission.status !== "OFFERED") {
      throw new HttpError("This admission offer has already been responded to", 409);
    }

    // Duplicate-student guard: user or applicant already converted
    const existingStudent = await prisma.student.findFirst({
      where: { OR: [{ userId: session.id }, { applicantId: applicant.id }] },
    });
    if (existingStudent) {
      throw new HttpError("A student record already exists for this account", 409);
    }

    const inst = await getInstitutionSettings();
    const seq = await prisma.student.count();
    const matricNumber = generateMatricNumber(inst.matricPrefix, admission.academicSession.name, seq + 1);

    // Atomic conversion: admission accepted + application closed + student created + role granted
    const student = await prisma.$transaction(async (tx) => {
      await tx.admission.update({
        where: { id: admission.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
      await tx.application.update({
        where: { id: admission.applicationId },
        data: { status: "ADMITTED" },
      });
      const studentRole = await tx.role.findUnique({ where: { name: "STUDENT" } });
      if (studentRole) {
        const already = await tx.userRole.findUnique({
          where: { userId_roleId: { userId: session.id, roleId: studentRole.id } },
        });
        if (!already) {
          await tx.userRole.create({ data: { userId: session.id, roleId: studentRole.id } });
        }
      }
      return tx.student.create({
        data: {
          userId: session.id,
          applicantId: applicant.id,
          admissionId: admission.id,
          matricNumber,
          currentProgrammeId: admission.programmeId,
          currentLevelValue: admission.levelValue,
          entryType: admission.application.applicationType === "DIRECT_ENTRY" ? "DIRECT_ENTRY" : "UTME",
          admissionDate: new Date(),
          status: "ACTIVE",
        },
      });
    });

    await recordAudit({
      userId: session.id,
      action: "ADMISSION_ACCEPTED",
      entityType: "Admission",
      entityId: admission.id,
      newValues: { matricNumber },
    });

    await notifyUser({
      userId: session.id,
      subject: "Admission accepted — welcome!",
      body: `Congratulations ${applicant.firstName}! Your admission has been accepted and your matriculation number is ${matricNumber}. Log in to the student portal to view your fees and register courses.`,
    });

    return created({ matricNumber, studentId: student.id }, "Admission accepted — you are now a student");
  });
}
