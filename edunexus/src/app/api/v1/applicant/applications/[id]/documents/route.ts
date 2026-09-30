import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { created, fail, handle, notFound, HttpError } from "@/lib/api";
import { requireRole, AuthError } from "@/lib/auth";
import { storeUpload } from "@/lib/files";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/applicant/applications/{id}/documents (multipart/form-data)
export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await requireRole("APPLICANT");
    const { id } = await ctx.params;
    const applicant = await prisma.applicant.findUnique({ where: { userId: session.id } });
    if (!applicant) throw new AuthError("Applicant profile not found", 404);
    const application = await prisma.application.findFirst({
      where: { id, applicantId: applicant.id },
    });
    if (!application) throw notFound("Application not found");
    if (application.status !== "DRAFT" && application.status !== "PAYMENT_PENDING" && application.status !== "PAID") {
      throw new HttpError("Application already submitted — documents can no longer be changed", 409);
    }

    const form = await req.formData();
    const file = form.get("file");
    const documentType = String(form.get("documentType") ?? "").toUpperCase();
    if (!(file instanceof File)) return fail("Validation failed", 422, { file: ["A file is required"] });
    if (!documentType) return fail("Validation failed", 422, { documentType: ["Document type is required"] });

    const stored = await storeUpload(file);

    // Versioning: re-upload bumps version instead of overwriting (SRS §12)
    const last = await prisma.applicationDocument.findFirst({
      where: { applicationId: application.id, documentType: documentType as never },
      orderBy: { version: "desc" },
    });

    const doc = await prisma.applicationDocument.create({
      data: {
        applicationId: application.id,
        documentType: documentType as never,
        originalFileName: stored.originalFileName,
        storedFileName: stored.storedFileName,
        storagePath: stored.storagePath,
        mimeType: stored.mimeType,
        fileSize: stored.fileSize,
        version: (last?.version ?? 0) + 1,
      },
    });
    return created({ document: doc }, "Document uploaded");
  });
}
