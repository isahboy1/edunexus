import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { created, fail, handle, ok } from "@/lib/api";
import { recordAudit, requireRole } from "@/lib/auth";
import { upsertSchema, validationErrors } from "@/lib/testimonials";

// GET /api/v1/admin/testimonials — full list (all statuses), newest first.
export async function GET() {
  return handle(async () => {
    await requireRole("SUPER_ADMIN", "REGISTRAR");
    const testimonials = await prisma.testimonial.findMany({
      orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    return ok({ testimonials });
  });
}

// POST /api/v1/admin/testimonials — create a quote (DRAFT unless stated).
export async function POST(req: NextRequest) {
  return handle(async () => {
    const staff = await requireRole("SUPER_ADMIN", "REGISTRAR");
    const body = await req.json().catch(() => null);
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return fail("Validation failed", 422, { ...validationErrors });
    }
    const data = parsed.data;
    const testimonial = await prisma.testimonial.create({
      data: {
        studentName: data.studentName.trim(),
        role: data.role?.trim() || null,
        quote: data.quote.trim(),
        displayOrder: data.displayOrder ?? 0,
        status: data.status ?? "DRAFT",
        publishedAt: data.status === "PUBLISHED" ? new Date() : null,
      },
    });
    await recordAudit({
      userId: staff.id,
      action: "TESTIMONIAL_CREATED",
      entityType: "Testimonial",
      entityId: testimonial.id,
      newValues: { studentName: testimonial.studentName, status: testimonial.status },
    });
    return created({ testimonial });
  });
}
