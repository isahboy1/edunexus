import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { fail, handle, notFound, ok } from "@/lib/api";
import { recordAudit, requireRole } from "@/lib/auth";
import { patchSchema, publishedAtTransition, validationErrors } from "@/lib/testimonials";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/v1/admin/testimonials/[id] — edit fields or flip status.
export async function PATCH(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const staff = await requireRole("SUPER_ADMIN", "REGISTRAR");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return fail("Validation failed", 422, { ...validationErrors });
    }

    const existing = await prisma.testimonial.findUnique({ where: { id } });
    if (!existing) return notFound("Testimonial not found");

    const data = parsed.data;
    const testimonial = await prisma.testimonial.update({
      where: { id },
      data: {
        studentName: data.studentName?.trim(),
        role: data.role === undefined ? undefined : data.role?.trim() || null,
        quote: data.quote?.trim(),
        displayOrder: data.displayOrder,
        status: data.status,
        // Stamp publishedAt on the first transition into PUBLISHED.
        publishedAt: publishedAtTransition(existing, data),
      },
    });

    await recordAudit({
      userId: staff.id,
      action: data.status && data.status !== existing.status ? `TESTIMONIAL_${data.status}` : "TESTIMONIAL_UPDATED",
      entityType: "Testimonial",
      entityId: id,
      oldValues: { status: existing.status },
      newValues: { status: testimonial.status },
    });
    return ok({ testimonial });
  });
}

// DELETE /api/v1/admin/testimonials/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const staff = await requireRole("SUPER_ADMIN", "REGISTRAR");
    const { id } = await params;
    const existing = await prisma.testimonial.findUnique({ where: { id } });
    if (!existing) return notFound("Testimonial not found");
    await prisma.testimonial.delete({ where: { id } });
    await recordAudit({
      userId: staff.id,
      action: "TESTIMONIAL_DELETED",
      entityType: "Testimonial",
      entityId: id,
      oldValues: { studentName: existing.studentName },
    });
    return ok({ deleted: true });
  });
}
