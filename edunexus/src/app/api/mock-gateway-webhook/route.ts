import { NextRequest } from "next/server";
import crypto from "crypto";
import { NextResponse } from "next/server";

// DEV ONLY: simulates the *gateway side* of the webhook flow by signing the
// payload (the browser cannot know the webhook secret, so this runs
// server-side). The signed body matches the Laravel contract:
//   { event, reference, status } signed with HMAC-SHA512(rawBody, secret)
// and posted to the Laravel API at POST /api/v1/payments/webhook.
export async function POST(req: NextRequest) {
  const { outcome, payload } = (await req.json()) as {
    outcome: "success" | "fail";
    payload: { event: string; reference: string };
  };

  const success = outcome === "success";
  const body = JSON.stringify({
    event: success ? "charge.success" : "charge.failed",
    reference: payload.reference,
    status: success ? "SUCCESSFUL" : "FAILED",
  });

  const secret =
    process.env.PAYMENT_WEBHOOK_SECRET ?? "dev-webhook-secret-change-me";
  const signature = crypto.createHmac("sha512", secret).update(body).digest("hex");

  const base =
    process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";
  const webhookUrl = new URL(`${base}/payments/webhook`);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-edunexus-signature": signature,
      },
      body,
    });
    const json = await res.json().catch(() => ({}));
    return NextResponse.json({
      ok: res.ok && json?.ok === true,
      gatewayStatus: success ? "SUCCESSFUL" : "FAILED",
      message: json?.message ?? null,
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Gateway webhook unreachable." },
      { status: 502 }
    );
  }
}
