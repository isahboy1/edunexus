import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

// GET /api/v1/admin/audit-logs — immutable trail (SRS §45)
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireRole("SUPER_ADMIN", "REGISTRAR");
    const sp = new URL(req.url).searchParams;
    const where: Record<string, unknown> = {};
    const action = sp.get("action");
    if (action) where.action = { contains: action, mode: "insensitive" };
    const entityId = sp.get("entityId");
    if (entityId) where.entityId = entityId;
    const userId = sp.get("userId");
    if (userId) where.userId = userId;

    const page = Math.max(Number(sp.get("page") ?? 1), 1);
    const pageSize = Math.min(Number(sp.get("pageSize") ?? 30), 100);

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);
    return ok({ logs }, { total, page, pageSize, pages: Math.ceil(total / pageSize) });
  });
}
