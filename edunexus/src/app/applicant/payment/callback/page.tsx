"use client";

import { useEffect, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Spinner, Alert } from "@/components/ui";
import { api } from "@/lib/laravel";

function Callback() {
  const params = useSearchParams();
  const reference = params.get("reference");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) return;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      // Laravel GET /payments/{reference} returns the status at `data.status`.
      const res = await api<{ status: string }>(`/payments/${reference}`);
      const s = res.data?.status;
      if (s === "SUCCESSFUL" || s === "FAILED") {
        setStatus(s);
        clearInterval(timer);
      } else if (attempts > 10) {
        setStatus("PENDING");
        clearInterval(timer);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [reference]);

  if (!reference) {
    return <Alert kind="error">Missing payment reference.</Alert>;
  }

  if (!status) return <Spinner label="Confirming your payment…" />;

  return (
    <div className="card-p text-center">
      <p className="text-4xl">{status === "SUCCESSFUL" ? "✅" : "⏳"}</p>
      <h1 className="mt-2 text-lg font-extrabold">
        {status === "SUCCESSFUL" ? "Payment Confirmed" : "Payment Processing"}
      </h1>
      <p className="muted mt-1 text-sm">
        {status === "SUCCESSFUL"
          ? "Your application fee has been received. You can now submit your application."
          : "Your payment is still being confirmed. Refresh this page in a moment."}
      </p>
      <Link className="btn-primary mt-5" href="/applicant/dashboard">Back to Dashboard →</Link>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <Suspense fallback={<Spinner />}>
        <Callback />
      </Suspense>
    </main>
  );
}
