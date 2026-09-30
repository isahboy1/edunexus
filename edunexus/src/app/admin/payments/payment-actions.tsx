"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/laravel";
import { formatNaira } from "@/lib/format";
import { Icon } from "@/components/icons";

export function PaymentActions({
  reference,
  status,
  amount,
}: {
  reference: string;
  status: string;
  amount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function confirmPayment() {
    setBusy("confirm");
    setError(null);
    try {
      const res = await apiPost(`/bursary/payments/${encodeURIComponent(reference)}/confirm`);
      if (!res.ok) setError(res.message || "Confirmation failed.");
      else {
        setConfirming(false);
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function verifyGateway() {
    setBusy("verify");
    setError(null);
    try {
      const res = await apiPost(`/bursary/payments/${encodeURIComponent(reference)}/verify`);
      if (!res.ok) setError(res.message || "Gateway verification failed.");
      else router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (status === "SUCCESSFUL") {
    return <span className="text-xs text-ink-400">Confirmed</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        <button type="button" className="btn-outline btn-sm" onClick={verifyGateway} disabled={busy !== null} aria-busy={busy === "verify"}>
          <Icon name="search" className="h-3.5 w-3.5" /> Verify
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={() => setConfirming(true)} disabled={busy !== null}>
          Confirm
        </button>
      </div>
      {error && <p className="error-text text-right" role="alert">{error}</p>}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 p-4" role="dialog" aria-modal="true" aria-label="Confirm payment">
          <div className="card-flush w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-[15px] font-bold text-ink-900">Confirm payment</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">
                Confirm that {formatNaira(amount)} for <span className="font-mono text-xs">{reference}</span> was received
                (teller / bank / RRR confirmation)? A receipt will be generated and the action audit-logged.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button type="button" className="btn-outline" onClick={() => setConfirming(false)} disabled={busy !== null}>Cancel</button>
              <button type="button" className="btn-primary" onClick={confirmPayment} disabled={busy !== null} aria-busy={busy === "confirm"}>
                {busy === "confirm" ? "Confirming…" : "Confirm payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
