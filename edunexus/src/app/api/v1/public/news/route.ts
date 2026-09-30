import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";

// GET /api/v1/public/news — published news
export async function GET(req: NextRequest) {
  return handle(async () => {
    const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 12), 50);
    const news = await prisma.news.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: limit,
      select: {
        id: true, title: true, slug: true, excerpt: true, imageUrl: true,
        authorName: true, publishedAt: true,
      },
    });
    return ok({ news });
  });
}
