"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui";
import { apiGet } from "@/lib/laravel";

type PaymentInfo = {
  reference: string;
  amount: number;
  currency: string;
  gateway: string;
  rrr: string | null;
  status: string;
  paidAt: string | null;
};

function Instruction() {
  const params = useSearchParams();
  const reference = params.get("reference");
  const next = params.get("next");
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!reference) return;
    const res = await apiGet<PaymentInfo>(`/payments/${encodeURIComponent(reference)}`);
    if (res.ok && res.data) {
      setPayment(res.data);
      setError(null);
    } else {
      setError(res.message || "Payment not found.");
    }
  }, [reference]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while the payment is still pending confirmation.
  useEffect(() => {
    if (!payment || payment.status === "SUCCESSFUL") return;
    timer.current = setInterval(load, 8000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [payment, load]);

  const checkNow = async () => {
    setChecking(true);
    await load();
    setChecking(false);
  };

  // DEV ONLY: simulate the signed Remita confirmation hitting the webhook.
  const simulateConfirmation = async () => {
    if (!reference) return;
    setChecking(true);
    await fetch("/api/mock-gateway-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: "success", payload: { event: "charge.success", reference } }),
    });
    await load();
    setChecking(false);
  };

  if (!reference) {
    return <div className="card-p">Missing payment reference.</div>;
  }

  if (error && !payment) {
    return <div className="card-p text-red-700">{error}</div>;
  }

  if (!payment) {
    return <Spinner />;
  }

  const paid = payment.status === "SUCCESSFUL";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card-p">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <span className="text-sm font-bold text-brand-800">
            Remita Payment Instruction
          </span>
          <span className={`badge ${paid ? "badge-green" : "badge-amber"}`}>
            {payment.status}
          </span>
        </div>

        <div className="mt-5 rounded-lg border-2 border-dashed border-brand-300 bg-brand-50 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">
            Remita Retrieval Reference (RRR)
          </p>
          <p className="mt-1 font-mono text-3xl font-extrabold tracking-widest text-brand-900">
            {payment.rrr ?? "—"}
          </p>
          <p className="mt-2 text-2xl font-extrabold">
            ₦{Number(payment.amount).toLocaleString()}
          </p>
          <p className="muted mt-1 font-mono text-xs">Ref: {payment.reference}</p>
        </div>

        <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-ink-700">
          <li>
            Visit any bank branch, ATM, or internet banking, or go to{" "}
            <b>remita.net</b>.
          </li>
          <li>
            Choose <b>&ldquo;Pay Bills&rdquo;</b> / <b>Others</b> and enter the RRR shown above.
          </li>
          <li>Pay the exact amount shown. You will receive a payment receipt.</li>
          <li>
            Confirmation is automatic once Remita notifies the school — check back
            on this page or your dashboard.
          </li>
        </ol>

        {paid ? (
          <div className="mt-5 rounded-lg bg-green-50 p-4 text-center">
            <p className="text-2xl">✅</p>
            <p className="font-bold text-green-800">Payment confirmed</p>
            <p className="text-sm text-green-700">
              Received {payment.paidAt ? new Date(payment.paidAt).toLocaleString() : ""} — you
              may continue your application.
            </p>
            <a className="btn-primary mt-4" href={next ?? "/applicant/dashboard"}>
              {next === "/student/fees" ? "Back to Fees & Payments →" : "Return to Dashboard →"}
            </a>
          </div>
        ) : (
          <div className="mt-5 grid gap-2">
            <button className="btn-outline" disabled={checking} onClick={checkNow}>
              {checking ? "Checking…" : "I have paid — check status"}
            </button>
            <button className="btn-danger" disabled={checking} onClick={simulateConfirmation}>
              ⚙ Simulate Remita confirmation (dev only)
            </button>
            <p className="muted text-xs">
              Status is verified server-side against the gateway — the browser is
              never trusted. This page refreshes every 8 seconds until confirmed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RemitaInstructionPage() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-12">
      <Suspense fallback={<Spinner />}>
        <Instruction />
      </Suspense>
    </main>
  );
}
