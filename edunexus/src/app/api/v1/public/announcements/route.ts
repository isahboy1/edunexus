import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";

// GET /api/v1/public/announcements — currently visible announcements
export async function GET() {
  return handle(async () => {
    const now = new Date();
    const announcements = await prisma.announcement.findMany({
      where: {
        status: "PUBLISHED",
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return ok({ announcements });
  });
}
