import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { TestimonialsManager, type TestimonialRow } from "./testimonials-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Testimonials — Admin" };

export default async function AdminTestimonialsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/testimonials");
  if (!hasRole(user, "SUPER_ADMIN", "REGISTRAR")) redirect("/admin/dashboard");

  const testimonials = await prisma.testimonial.findMany({
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  const rows: TestimonialRow[] = testimonials.map((t) => ({
    id: t.id,
    studentName: t.studentName,
    role: t.role,
    quote: t.quote,
    status: t.status,
    displayOrder: t.displayOrder,
  }));

  const published = rows.filter((r) => r.status === "PUBLISHED").length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Homepage content"
        title="Testimonials"
        description="Curate the student quotes shown on the public homepage. Only published quotes appear — drafts stay in-house."
        icon="sparkles"
      />
      <p className="text-sm text-ink-600">
        {published} published · {rows.length - published} in draft
      </p>
      <TestimonialsManager initial={rows} />
    </div>
  );
}
