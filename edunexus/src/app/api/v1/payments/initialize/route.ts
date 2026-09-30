import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { created, fail, handle, notFound, HttpError } from "@/lib/api";
import { requireRole, AuthError } from "@/lib/auth";
import { getPaymentGateway, newReference } from "@/lib/payments";
import { getAdmissionWindow, assertApplicationWindowOpen } from "@/lib/settings";

// POST /api/v1/payments/initialize
// Body: { applicationId }
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireRole("APPLICANT");
    const body = (await req.json().catch(() => null)) as { applicationId?: string } | null;
    if (!body?.applicationId) return fail("Validation failed", 422, { applicationId: ["applicationId is required"] });

    const applicant = await prisma.applicant.findUnique({
      where: { userId: session.id },
      include: { user: { select: { email: true } } },
    });
    if (!applicant) throw new AuthError("Applicant profile not found", 404);
    const application = await prisma.application.findFirst({
      where: { id: body.applicationId, applicantId: applicant.id },
      include: { academicSession: true },
    });
    if (!application) throw notFound("Application not found");

    if (application.status !== "DRAFT" && application.status !== "PAYMENT_PENDING" && application.status !== "PAID") {
      throw new HttpError("This application can no longer accept payments", 409);
    }
    await assertApplicationWindowOpen(application.academicSessionId);

    // Amount is admin-configured per session (never hard-coded, SRS §13)
    const win = await getAdmissionWindow(application.academicSessionId);
    if (!win) throw new HttpError("Application fee is not configured for this session", 400);

    // Prevent double-invoicing while a payment is in flight
    const pending = await prisma.applicationPayment.findFirst({
      where: { applicationId: application.id, status: { in: ["PENDING", "PROCESSING"] } },
    });
    if (pending) {
      return created(
        { reference: pending.reference, gateway: pending.gateway, resume: true },
        "A payment attempt is already in progress"
      );
    }

    const gateway = getPaymentGateway();
    const reference = newReference("EDU-APP");
    const callbackUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/applicant/payment/callback`;

    const init = await gateway.initialize({
      reference,
      amount: win.applicationFee,
      currency: win.currency,
      email: applicant.user.email,
      callbackUrl,
    });

    await prisma.applicationPayment.create({
      data: {
        applicationId: application.id,
        reference,
        amount: win.applicationFee,
        currency: win.currency,
        gateway: init.gateway,
        status: "PENDING",
      },
    });

    // Reflect intent in application state
    await prisma.application.update({
      where: { id: application.id },
      data: { status: "PAYMENT_PENDING" },
    });

    await recordAuditPaymentInit(session.id, reference, application.id);

    return created({ checkoutUrl: init.checkoutUrl, reference }, "Payment initialized");
  });
}

async function recordAuditPaymentInit(userId: string, reference: string, applicationId: string) {
  const { recordAudit } = await import("@/lib/auth");
  await recordAudit({
    userId,
    action: "PAYMENT_INITIALIZED",
    entityType: "ApplicationPayment",
    entityId: reference,
    newValues: { applicationId },
  });
}
