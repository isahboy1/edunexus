import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { formatDate, formatDateTime, formatEnum, formatNaira } from "@/lib/format";
import { Icon } from "@/components/icons";
import { AutoPrintReceipt, PrintReceiptButton } from "./print-controls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Fee Payment Receipt",
  // A printable document view — nothing to index.
  robots: { index: false, follow: false },
};

type Receipt = {
  reference: string;
  amount: number;
  currency: string;
  gateway: string;
  rrr: string | null;
  status: string;
  paidAt: string | null;
  invoiceNumber: string | null;
  invoiceType: string | null;
  payerName: string | null;
  matricNumber: string | null;
};

function Row({ label, value, wide }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return (
    <div className={wide ? "print-row-wide" : "print-row"}>
      <span className="print-label">{label}</span>
      <span className="print-value">{value || "—"}</span>
    </div>
  );
}

/**
 * /student/receipts/[reference] — printable receipt for a successful school-fee
 * payment (invoice number, RRR, amount, date). Deliberately OUTSIDE the portal
 * shell (root layout only): @media print strips the toolbar so the paper output
 * is the receipt alone. `?autoprint=1` opens the print dialog on load. Access
 * is enforced server-side by the API (students may only look up their own
 * payments); a non-SUCCESSFUL payment shows a notice instead of a receipt.
 */
export default async function StudentReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { reference } = await params;
  const { autoprint } = await searchParams;

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/student/receipts/${reference}`);
  if (!hasRole(user, "STUDENT", "SUPER_ADMIN", "BURSARY_OFFICER", "REGISTRAR")) redirect("/");

  const res = await serverApi<Receipt>(`/payments/${encodeURIComponent(reference)}`);
  if (res.status === 404) notFound();
  if (!res.ok || !res.data) redirect("/student/fees");

  const r = res.data;
  const settled = r.status === "SUCCESSFUL";

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <div>
          <p className="text-[13.5px] font-bold text-brand-950">Fee payment receipt</p>
          <p className="text-[11px] text-ink-400">
            Reference <span className="font-mono">{r.reference}</span> · {formatEnum(r.status)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/student/fees" className="btn-outline">
            Back to fees
          </Link>
          {settled && (
            <a href={`/api/v1/payments/${encodeURIComponent(r.reference)}/receipt`} className="btn-outline">
              <Icon name="download" className="h-4 w-4" /> Download PDF
            </a>
          )}
          {settled && <PrintReceiptButton />}
        </div>
      </div>
      {autoprint === "1" && <AutoPrintReceipt />}

      <article className="print-sheet mx-auto my-8" aria-label={`Payment receipt ${r.reference}`}>
        <header className="print-letterhead">
          <h1>Adamu Kankon College of Islamic and Legal Studies</h1>
          <p className="print-sub">
            Official Fee Payment Receipt — {r.invoiceType ? formatEnum(r.invoiceType) : "School Fees"}
          </p>
        </header>

        {!settled && (
          <p className="print-empty" role="alert">
            This payment is not confirmed yet (status: {formatEnum(r.status)}). A receipt is issued only
            after the gateway webhook or the Bursary confirms the transaction.
          </p>
        )}

        <div className="print-meta">
          <Row label="Receipt No." value={r.reference} />
          <Row label="Invoice No." value={r.invoiceNumber} />
          <Row label="RRR" value={r.rrr} />
          <Row label="Paid On" value={r.paidAt ? formatDateTime(r.paidAt) : null} />
          <Row label="Gateway" value={formatEnum(r.gateway)} />
          <Row label="Status" value={settled ? "SUCCESSFUL" : formatEnum(r.status)} />
        </div>

        <section>
          <h2 className="print-heading">Payment Details</h2>
          <div className="print-grid">
            <Row label="Payer" value={r.payerName ?? user.name} />
            <Row label="Matric No." value={r.matricNumber} />
            <Row label="Fee Type" value={r.invoiceType ? formatEnum(r.invoiceType) : "School Fees"} />
            <Row label="Amount Paid" value={formatNaira(r.amount)} wide />
          </div>
          <p className="print-paid-note">
            <strong>Amount in words:</strong> {amountInWords(r.amount)} naira only.
          </p>
        </section>

        <div className="print-declaration">
          This receipt is system-generated and valid without signature. Payments are confirmed only through
          the signed gateway webhook or by the Bursary; the printed amount reflects the verified transaction
          above. Keep this receipt for your records — it may be required during registration clearance.
        </div>

        <div className="print-signatures">
          <div>
            <div className="print-sign-line" />
            <p>Bursary</p>
          </div>
          <div>
            <div className="print-sign-line" />
            <p>Student</p>
          </div>
        </div>

        <p className="print-footer">
          Generated by EduNexus on {formatDate(new Date())} · Receipt No. {r.reference}
          {r.rrr ? ` · Remita RRR ${r.rrr}` : ""}
        </p>
      </article>
    </div>
  );
}

/** Integer part to English words (naira receipts conventionally avoid kobo fractions). */
function amountInWords(amount: number): string {
  const n = Math.floor(Math.abs(Number(amount) || 0));
  if (n === 0) return "Zero";
  const ones = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const group = (num: number): string => {
    if (num === 0) return "";
    if (num < 20) return ones[num];
    if (num < 100) return `${tens[Math.floor(num / 10)]}${num % 10 ? "-" + ones[num % 10] : ""}`;
    return `${ones[Math.floor(num / 100)]} hundred${num % 100 ? " " + group(num % 100) : ""}`;
  };
  const scales: [number, string][] = [[1_000_000_000, "billion"], [1_000_000, "million"], [1_000, "thousand"]];
  const parts: string[] = [];
  let rest = n;
  for (const [value, name] of scales) {
    const count = Math.floor(rest / value);
    if (count > 0) {
      parts.push(`${group(count)} ${name}`);
      rest -= count * value;
    }
  }
  if (rest > 0) parts.push(group(rest));
  return parts.join(" ");
}
