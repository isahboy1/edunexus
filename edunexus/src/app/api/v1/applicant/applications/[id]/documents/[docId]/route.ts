import { NextRequest } from "next/server";
import { unlink } from "fs/promises";
import { prisma } from "@/lib/db";
import { handle, ok, notFound } from "@/lib/api";
import { requireRole, AuthError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string; docId: string }> };

// DELETE /api/v1/applicant/applications/{id}/documents/{docId}
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await requireRole("APPLICANT");
    const { id, docId } = await ctx.params;
    const applicant = await prisma.applicant.findUnique({ where: { userId: session.id } });
    if (!applicant) throw new AuthError("Applicant profile not found", 404);
    const application = await prisma.application.findFirst({
      where: { id, applicantId: applicant.id },
    });
    if (!application) throw notFound("Application not found");

    const doc = await prisma.applicationDocument.findFirst({
      where: { id: docId, applicationId: application.id },
    });
    if (!doc) throw notFound("Document not found");

    // Newest version stays; older ones may be removed
    await prisma.applicationDocument.delete({ where: { id: doc.id } });
    try {
      await unlink(doc.storagePath);
    } catch {
      // file already gone — ignore
    }
    return ok({ deleted: true }, "Document removed");
  });
}
