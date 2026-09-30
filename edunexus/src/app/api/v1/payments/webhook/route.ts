import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { fail, handle, ok } from "@/lib/api";
import { getPaymentGateway } from "@/lib/payments";
import { recordAudit } from "@/lib/auth";
import { notifyUser } from "@/lib/notify";

// POST /api/v1/payments/webhook — provider pushes payment outcome here.
// A payment only becomes SUCCESSFUL after server-side verification (SRS §43).
export async function POST(req: NextRequest) {
  return handle(async () => {
    const payload = await req.json().catch(() => null);
    const reference = (payload?.reference ?? payload?.data?.reference) as string | undefined;
    if (!reference) return fail("Missing payment reference", 400);

    // Signature check (mock gateway signs with AUTH_SECRET; Paystack uses its secret)
    const signature = req.headers.get("x-edunexus-signature") ?? "";
    const secret = process.env.PAYMENT_GATEWAY === "paystack" ? process.env.PAYSTACK_SECRET_KEY ?? "" : process.env.AUTH_SECRET ?? "";
    const expected = crypto.createHmac("sha512", secret).update(JSON.stringify(payload)).digest("hex");
    const provided = signature.replace(/^sha512=/, "").replace(/^sha256=/, "");
    if (!secret || provided !== expected) {
      return fail("Invalid webhook signature", 401);
    }

    // Never trust the payload status — verify with the gateway
    const gateway = getPaymentGateway();
    const verified = await gateway.verify(reference);

    const payment = await prisma.applicationPayment.findUnique({ where: { reference } });
    if (!payment) return fail("Unknown payment reference", 404);

    if (payment.status === "SUCCESSFUL") {
      // Idempotency: already processed
      return ok({ reference, status: payment.status }, "Payment already verified");
    }

    const newStatus =
      verified.status === "SUCCESSFUL" ? "SUCCESSFUL" : verified.status === "FAILED" ? "FAILED" : "PROCESSING";

    await prisma.$transaction([
      prisma.applicationPayment.update({
        where: { reference },
        data: {
          status: newStatus,
          gatewayTransactionId: verified.gatewayTransactionId,
          gatewayResponse: verified.raw as object,
          paidAt: newStatus === "SUCCESSFUL" ? new Date() : null,
        },
      }),
      ...(newStatus === "SUCCESSFUL"
        ? [
            prisma.application.update({
              where: { id: payment.applicationId },
              data: { paymentStatus: "SUCCESSFUL", status: "PAID" },
            }),
          ]
        : []),
    ]);

    await recordAudit({
      action: "PAYMENT_VERIFIED",
      entityType: "ApplicationPayment",
      entityId: reference,
      newValues: { status: newStatus, applicationId: payment.applicationId },
    });

    if (newStatus === "SUCCESSFUL") {
      const application = await prisma.application.findUnique({
        where: { id: payment.applicationId },
        select: { applicantId: true, applicationNumber: true, applicant: { select: { userId: true, firstName: true } } },
      });
      if (application) {
        await notifyUser({
          userId: application.applicant.userId,
          subject: "Payment confirmed",
          body: `Dear ${application.applicant.firstName}, your application fee payment (ref ${reference}) for application ${application.applicationNumber} was confirmed successfully. You can now submit your application.`,
        });
      }
    }

    return ok({ reference, status: newStatus }, "Webhook processed");
  });
}
