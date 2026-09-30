"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/laravel";
import { formatNaira } from "@/lib/format";
import { Icon } from "@/components/icons";

type InvoiceLite = {
  id: string;
  invoiceNumber: string | null;
  balance: number;
  status: string;
};

/**
 * Client actions for the student fees page:
 *  - "Pay now" starts a gateway payment for an invoice — in full or for a
 *    custom partial amount up to the outstanding balance (the invoice then
 *    shows PARTIALLY_PAID until fully settled).
 *  - "Resume payment" re-opens an in-flight PENDING/PROCESSING payment.
 * Payment success is only ever recorded server-side via the signed webhook
 * (or bursary confirmation) — never by the browser.
 */
export function PayNowButton({ invoice }: { invoice: InvoiceLite }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [amountText, setAmountText] = useState(invoice.balance.toFixed(2));

  const amount = Number(amountText);
  const amountValid = Number.isFinite(amount) && amount >= 1 && amount <= invoice.balance + 0.001;
  const partial = amountValid && amount < invoice.balance - 0.001;

  function openDialog() {
    setAmountText(invoice.balance.toFixed(2));
    setError(null);
    setOpen(true);
  }

  async function startPayment(value: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<Record<string, unknown>>(
        `/student/invoices/${invoice.id}/payments`,
        { amount: Math.round(value * 100) / 100 }
      );
      if (!res.ok) {
        setError(res.message || "Could not start the payment.");
        return;
      }
      const gw = (res.data?.gatewayResponse ?? {}) as Record<string, unknown>;
      const url =
        (gw.checkoutUrl as string) ?? (gw.instructionUrl as string) ?? null;
      if (!url) {
        setError("Payment gateway did not return a payment URL.");
        return;
      }
      window.location.href = url;
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-primary btn-sm"
        onClick={openDialog}
        disabled={busy}
        aria-haspopup="dialog"
      >
        <Icon name="wallet" className="h-3.5 w-3.5" />
        Pay {formatNaira(invoice.balance)}
      </button>
      {error && (
        <p className="error-text text-right" role="alert">
          {error}
        </p>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Pay invoice ${invoice.invoiceNumber ?? ""}`}
        >
          <form
            className="card-flush w-full max-w-md rounded-xl bg-white shadow-xl"
            onSubmit={(e) => {
              e.preventDefault();
              if (amountValid && !busy) void startPayment(amount);
            }}
          >
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-[15px] font-bold text-ink-900">Pay invoice</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">
                Invoice <span className="font-mono text-xs">{invoice.invoiceNumber ?? invoice.id}</span> has an
                outstanding balance of <strong>{formatNaira(invoice.balance)}</strong>. Pay in full, or enter a
                partial amount — the invoice settles progressively.
              </p>
            </div>

            <div className="px-5 py-4">
              <label className="block text-[12px] font-semibold text-ink-700" htmlFor="pay-amount">
                Amount to pay (₦)
              </label>
              <input
                id="pay-amount"
                type="number"
                inputMode="decimal"
                min={1}
                max={invoice.balance}
                step="0.01"
                required
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                className="input mt-1.5"
                aria-invalid={!amountValid}
                aria-describedby="pay-amount-hint"
                autoFocus
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[0.25, 0.5, 1].map((frac) => (
                  <button
                    key={frac}
                    type="button"
                    className="chip"
                    onClick={() => setAmountText((Math.round(invoice.balance * frac * 100) / 100).toFixed(2))}
                  >
                    {frac === 1 ? `Full balance` : `${frac * 100}%`}
                  </button>
                ))}
              </div>
              <p id="pay-amount-hint" className="mt-2 text-xs text-ink-600">
                {partial
                  ? `This leaves ${formatNaira(invoice.balance - amount)} outstanding — the invoice will show as partially paid until settled.`
                  : "Enter an amount between ₦1 and the invoice balance."}
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-4">
              <button type="button" className="btn-outline" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={busy || !amountValid}
                aria-busy={busy}
              >
                {busy ? "Starting…" : `Pay ${amountValid ? formatNaira(amount) : ""}`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function ResumePaymentButton({ reference }: { reference: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resume() {
    setBusy(true);
    try {
      const res = await apiGet<Record<string, unknown>>(
        `/student/payments/${encodeURIComponent(reference)}`
      );
      const url =
        (res.data?.checkoutUrl as string) ??
        (res.data?.instructionUrl as string) ??
        null;
      if (res.ok && url) {
        window.location.href = url;
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn-outline btn-sm"
      onClick={resume}
      disabled={busy}
      aria-busy={busy}
    >
      {busy ? "Opening…" : "Resume payment"}
    </button>
  );
}
