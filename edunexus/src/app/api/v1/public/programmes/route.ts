import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { getInstitutionSettings } from "@/lib/settings";

// GET /api/v1/public/programmes — public catalogue
export async function GET() {
  return handle(async () => {
    const [programmes, inst, session] = await Promise.all([
      prisma.programme.findMany({
        where: { status: "ACTIVE" },
        orderBy: [{ department: { faculty: { name: "asc" } } }, { name: "asc" }],
        include: {
          department: {
            select: { name: true, code: true, faculty: { select: { name: true, code: true } } },
          },
        },
      }),
      getInstitutionSettings(),
      prisma.academicSession.findFirst({ where: { isCurrent: true } }),
    ]);
    const window = session
      ? await prisma.applicationSetting.findUnique({ where: { academicSessionId: session.id } })
      : null;
    return ok({
      institution: inst,
      currentSession: session ? { id: session.id, name: session.name } : null,
      admissionWindow: window
        ? {
            applicationFee: Number(window.applicationFee),
            currency: window.currency,
            opensAt: window.opensAt,
            closesAt: window.closesAt,
            isActive: window.isActive,
            allowedTypes: window.allowedTypes,
          }
        : null,
      programmes: programmes.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        award: p.award,
        durationYears: p.durationYears,
        description: p.description,
        department: p.department.name,
        faculty: p.department.faculty.name,
      })),
    });
  });
}
