import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

// GET /api/v1/admin/applications — filterable admissions queue (SRS §17)
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRole(
      "SUPER_ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER", "ACADEMIC_OFFICER", "HOD"
    );
    const sp = new URL(req.url).searchParams;

    const where: Record<string, unknown> = {};
    const status = sp.get("status");
    if (status) where.status = status;
    const programmeId = sp.get("programmeId");
    if (programmeId) where.programmeId = programmeId;
    const sessionId = sp.get("sessionId");
    if (sessionId) where.academicSessionId = sessionId;
    const type = sp.get("type");
    if (type) where.applicationType = type;
    const q = sp.get("q");
    if (q) {
      where.OR = [
        { applicationNumber: { contains: q, mode: "insensitive" } },
        { applicant: { surname: { contains: q, mode: "insensitive" } } },
        { applicant: { firstName: { contains: q, mode: "insensitive" } } },
      ];
    }
    const gender = sp.get("gender");
    if (gender) where.applicant = { ...(where.applicant as object ?? {}), gender };
    const state = sp.get("state");
    if (state) {
      where.applicant = { ...(where.applicant as object ?? {}), stateOfOrigin: { contains: state, mode: "insensitive" } };
    }

    const page = Math.max(Number(sp.get("page") ?? 1), 1);
    const pageSize = Math.min(Number(sp.get("pageSize") ?? 20), 100);

    const [total, applications] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        orderBy: { submittedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          applicant: {
            select: { surname: true, firstName: true, gender: true, stateOfOrigin: true },
          },
          programme: { select: { name: true, code: true, award: true } },
          academicSession: { select: { name: true } },
        },
      }),
    ]);

    return ok({ applications }, { total, page, pageSize, pages: Math.ceil(total / pageSize) });
  });
}
