import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

// GET /api/v1/admin/stats — dashboard summary (SRS §39)
export async function GET() {
  return handle(async () => {
    await requireRole(
      "SUPER_ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER",
      "ACADEMIC_OFFICER", "BURSARY_OFFICER", "HOD"
    );

    const [totalStudents, totalApplications, admitted, pendingReview, paymentAgg] =
      await Promise.all([
        prisma.student.count(),
        prisma.application.count(),
        prisma.application.count({ where: { status: "ADMITTED" } }),
        prisma.application.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "SCREENING"] } } }),
        prisma.applicationPayment.aggregate({
          where: { status: "SUCCESSFUL" },
          _sum: { amount: true },
          _count: true,
        }),
      ]);

    const byStatus = await prisma.application.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const statusCounts: Record<string, number> = {};
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    return ok({
      totals: {
        students: totalStudents,
        applications: totalApplications,
        admitted,
        pendingReview,
        revenue: Number(paymentAgg._sum.amount ?? 0),
        payments: paymentAgg._count,
      },
      applicationsByStatus: statusCounts,
    });
  });
}
