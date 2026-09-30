import { generatePaymentReference } from "@/lib/settings";

// Payment gateway abstraction (SRS §55: never hard-code a specific provider)

export interface InitializeResult {
  reference: string;
  checkoutUrl: string;
  gateway: string;
}

export interface VerifyResult {
  status: "SUCCESSFUL" | "FAILED" | "PENDING";
  gatewayTransactionId?: string;
  amount: number;
  currency: string;
  raw: unknown;
}

export interface PaymentGateway {
  readonly name: string;
  initialize(params: { reference: string; amount: number; currency: string; email: string; callbackUrl: string }): Promise<InitializeResult>;
  verify(reference: string): Promise<VerifyResult>;
  refund(reference: string): Promise<{ refunded: boolean }>;
}

// ── Mock gateway: development/testing. "Checkout" is an internal page that
// simulates the provider, then calls the webhook exactly like a real one would.
export class MockGateway implements PaymentGateway {
  readonly name = "mock";

  async refund(reference: string): Promise<{ refunded: boolean }> {
    return { refunded: true }; // simulated refund always succeeds
  }

  async initialize(params: { reference: string; amount: number; currency: string; email: string; callbackUrl: string }): Promise<InitializeResult> {
    const url = new URL("/payments/mock", params.callbackUrl);
    url.searchParams.set("reference", params.reference);
    url.searchParams.set("amount", String(params.amount));
    url.searchParams.set("email", params.email);
    return { reference: params.reference, checkoutUrl: url.toString(), gateway: this.name };
  }

  async verify(reference: string): Promise<VerifyResult> {
    return {
      status: "SUCCESSFUL",
      gatewayTransactionId: `MOCK-${reference}`,
      amount: 0,
      currency: "NGN",
      raw: { simulated: true, reference },
    };
  }
}

// ── Paystack adapter (real implementation point — needs PAYSTACK_SECRET_KEY)
export class PaystackGateway implements PaymentGateway {
  readonly name = "paystack";
  constructor(private secretKey: string) {}

  async initialize(params: { reference: string; amount: number; currency: string; email: string; callbackUrl: string }): Promise<InitializeResult> {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: params.email,
        amount: Math.round(params.amount * 100), // kobo
        currency: params.currency,
        reference: params.reference,
        callback_url: params.callbackUrl,
      }),
    });
    if (!res.ok) throw new Error(`Paystack initialize failed: ${res.status}`);
    const json = (await res.json()) as { data?: { authorization_url?: string; reference?: string } };
    if (!json.data?.authorization_url) throw new Error("Paystack initialize returned no authorization_url");
    return { reference: params.reference, checkoutUrl: json.data.authorization_url, gateway: this.name };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${this.secretKey}` },
    });
    if (!res.ok) throw new Error(`Paystack verify failed: ${res.status}`);
    const json = (await res.json()) as {
      data?: { status?: string; id?: number | string; amount?: number; currency?: string };
    };
    const d = json.data ?? {};
    const successful = d.status === "success";
    return {
      status: successful ? "SUCCESSFUL" : d.status === "abandoned" ? "PENDING" : "FAILED",
      gatewayTransactionId: d.id != null ? String(d.id) : undefined,
      amount: (d.amount ?? 0) / 100,
      currency: d.currency ?? "NGN",
      raw: json,
    };
  }

  async refund(reference: string): Promise<{ refunded: boolean }> {
    const res = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: reference }),
    });
    return { refunded: res.ok };
  }
}

export function getPaymentGateway(): PaymentGateway {
  const kind = (process.env.PAYMENT_GATEWAY ?? "mock").toLowerCase();
  if (kind === "paystack" && process.env.PAYSTACK_SECRET_KEY) {
    return new PaystackGateway(process.env.PAYSTACK_SECRET_KEY);
  }
  return new MockGateway();
}

export function newReference(prefix?: string): string {
  return generatePaymentReference(prefix);
}
