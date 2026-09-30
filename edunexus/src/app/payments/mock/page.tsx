"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui";

function MockCheckout() {
  const params = useSearchParams();
  const reference = params.get("reference");
  const amount = params.get("amount");
  const email = params.get("email");
  const next = params.get("next");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const fireWebhook = useCallback(
    async (outcome: "success" | "fail") => {
      if (!reference) return;
      setBusy(outcome);
      const payload = { event: "charge.success", reference };
      // Sign exactly like the real gateway would (HMAC-SHA512 with AUTH_SECRET for mock)
      const res = await fetch("/api/mock-gateway-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, payload }),
      });
      const json = await res.json().catch(() => ({}));
      setBusy(null);
      setDone(outcome === "success" ? (json.ok ? "success" : "error") : "failed");
    },
    [reference]
  );

  if (!reference) {
    return <div className="card-p">Missing payment reference.</div>;
  }

  if (done) {
    return (
      <div className="card-p text-center">
        <p className="text-4xl">{done === "success" ? "✅" : "❌"}</p>
        <h1 className="mt-2 text-lg font-extrabold">
          {done === "success" ? "Payment Successful" : "Payment Failed"}
        </h1>
        <p className="muted mt-1 text-sm">
          {done === "success"
            ? "Your payment has been verified and recorded."
            : "The payment was declined. You can retry from your dashboard."}
        </p>
        <a className="btn-primary mt-5" href={next ?? "/applicant/dashboard"}>
          {next === "/student/fees" ? "Back to Fees & Payments →" : "Return to Dashboard →"}
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card-p">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <span className="text-sm font-bold text-brand-800">EDUNEXUS Pay (Mock Gateway)</span>
          <span className="badge-gray badge">TEST MODE</span>
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-ink-600">Reference</dt><dd className="font-mono text-xs">{reference}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-600">Email</dt><dd>{email}</dd></div>
          <div className="flex justify-between text-base font-extrabold">
            <dt>Amount</dt><dd>₦{Number(amount ?? 0).toLocaleString()}</dd>
          </div>
        </dl>
        <div className="mt-5 grid gap-2">
          <button className="btn-primary" disabled={busy !== null} onClick={() => fireWebhook("success")}>
            {busy === "success" ? "Processing…" : "✓ Simulate Successful Payment"}
          </button>
          <button className="btn-danger" disabled={busy !== null} onClick={() => fireWebhook("fail")}>
            {busy === "fail" ? "Processing…" : "✗ Simulate Failed Payment"}
          </button>
        </div>
        <p className="muted mt-4 text-xs">
          This dev-only page simulates a payment provider. In production the real gateway collects card
          details on its own hosted page and calls the same webhook endpoint.
        </p>
      </div>
    </div>
  );
}

export default function MockCheckoutPage() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-12">
      <Suspense fallback={<Spinner />}>
        <MockCheckout />
      </Suspense>
    </main>
  );
}
