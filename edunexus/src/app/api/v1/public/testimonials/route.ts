import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { publicTestimonialsWhere } from "@/lib/testimonials";

// GET /api/v1/public/testimonials — published quotes for the public homepage.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 6), 12);
    const testimonials = await prisma.testimonial.findMany({
      where: publicTestimonialsWhere(),
      orderBy: [{ displayOrder: "asc" }, { publishedAt: "desc" }],
      take: limit,
      select: {
        id: true, studentName: true, role: true, quote: true, publishedAt: true,
      },
    });
    return ok({ testimonials });
  });
}
