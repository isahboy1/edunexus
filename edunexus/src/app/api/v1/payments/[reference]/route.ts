import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handle, ok, notFound } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { getPaymentGateway } from "@/lib/payments";

type Ctx = { params: Promise<{ reference: string }> };

// GET /api/v1/payments/{reference} — client-side status check after checkout redirect.
// Status shown here is informational; the authoritative transition happens in the webhook.
export async function GET(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireRole("APPLICANT");
    const { reference } = await ctx.params;
    const payment = await prisma.applicationPayment.findUnique({
      where: { reference },
      select: { reference: true, status: true, amount: true, currency: true, gateway: true, paidAt: true },
    });
    if (!payment) throw notFound("Payment not found");
    return ok({ payment });
  });
}
