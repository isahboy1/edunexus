import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { StatusBadge, StatCard, Alert, PageHeader, SectionCard, EmptyState, Progress } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatDate, formatNaira } from "@/lib/format";
import { PayNowButton, ResumePaymentButton } from "./pay-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fees & Payments — Student" };

type Fees = {
  summary: { total: number; paid: number; outstanding: number };
  invoices: {
    id: string;
    invoiceNumber: string;
    type: string;
    session: string | null;
    total: number;
    paid: number;
    balance: number;
    status: string;
    dueDate: string | null;
  }[];
};

type Payment = {
  reference: string;
  rrr: string | null;
  amount: number;
  currency: string;
  gateway: string;
  status: string;
  paidAt: string | null;
  invoice: string | null;
  invoiceType: string | null;
  receiptUrl: string | null;
};

export default async function StudentFeesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/student/fees");
  if (!hasRole(user, "STUDENT")) redirect("/student/dashboard");

  const [feesRes, paymentsRes] = await Promise.all([
    serverApi<Fees>("/student/fees"),
    serverApi<Payment[]>("/student/payments"),
  ]);

  const fees = feesRes.data;
  const payments = paymentsRes.data ?? [];

  const pendingPayment = payments.find(
    (p) => p.status === "PENDING" || p.status === "PROCESSING"
  );

  const cleared = fees ? fees.summary.total - fees.summary.outstanding : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Fees & Payments"
        description="Your invoices, balances and full payment history for the session."
        icon="wallet"
      />

      {!feesRes.ok && <Alert kind="error">{feesRes.message}</Alert>}

      {fees && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total Assessed" value={formatNaira(fees.summary.total)} icon="receipt" tone="brand" hint="Billed for this session" />
            <StatCard label="Amount Paid" value={formatNaira(fees.summary.paid)} icon="checkCircle" tone="accent" hint={`${fees.invoices.length} invoice${fees.invoices.length === 1 ? "" : "s"}`} />
            <StatCard
              label="Outstanding"
              value={formatNaira(fees.summary.outstanding)}
              icon="alert"
              tone={fees.summary.outstanding > 0 ? "rose" : "accent"}
              hint={fees.summary.outstanding > 0 ? "Registration blocked until cleared" : "Account fully settled"}
            />
          </div>

          <div className="card-flush p-5">
            <Progress
              value={cleared}
              max={Math.max(fees.summary.total, 1)}
              label="Fee clearance"
              hint={`${formatNaira(cleared)} of ${formatNaira(fees.summary.total)} settled`}
            />
          </div>

          {pendingPayment && (
            <Alert kind="warn" title="Payment in progress">
              You have a pending payment of {formatNaira(pendingPayment.amount)}{" "}
              (ref <span className="font-mono text-xs">{pendingPayment.reference}</span>). Complete
              it below, or start again from an invoice.
              <div className="mt-3">
                <ResumePaymentButton reference={pendingPayment.reference} />
              </div>
            </Alert>
          )}

          <SectionCard title="Invoices" subtitle="Fee assessment raised by the Bursary" icon="receipt" padded={false}>
            {fees.invoices.length === 0 ? (
              <EmptyState
                icon="receipt"
                title="No invoices raised yet"
                description="Your fee assessment for the session will appear here once published by the Bursary."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Invoice</th><th>Type</th><th>Session</th>
                      <th className="text-right">Total</th><th className="text-right">Paid</th>
                      <th className="text-right">Balance</th><th>Due</th><th>Status</th>
                      <th><span className="sr-only">Pay</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.invoices.map((i) => (
                      <tr key={i.id}>
                        <td className="font-mono text-xs text-ink-700">{i.invoiceNumber}</td>
                        <td className="text-ink-900">{i.type.replace(/_/g, " ")}</td>
                        <td className="text-xs text-ink-600">{i.session ?? "—"}</td>
                        <td className="text-right">{formatNaira(i.total)}</td>
                        <td className="text-right text-ink-600">{formatNaira(i.paid)}</td>
                        <td className="text-right font-semibold text-ink-900">{formatNaira(i.balance)}</td>
                        <td className="text-xs text-ink-600">{i.dueDate ? formatDate(i.dueDate) : "—"}</td>
                        <td><StatusBadge status={i.status} /></td>
                        <td className="text-right">
                          {i.balance > 0 ? (
                            <PayNowButton
                              invoice={{ id: i.id, invoiceNumber: i.invoiceNumber, balance: i.balance, status: i.status }}
                            />
                          ) : (
                            <span className="text-xs text-ink-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}

      <SectionCard title="Payment History" subtitle="Verified transactions and their RRR references" icon="clock" padded={false}>
        {payments.length === 0 ? (
          <EmptyState
            icon="wallet"
            title="No payments recorded yet"
            description="Once you pay a fee, the transaction and its receipt will be listed here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Reference</th><th>RRR</th><th>Invoice</th><th>Gateway</th>
                  <th className="text-right">Amount</th><th>Paid On</th><th>Status</th>
                  <th><span className="sr-only">Receipt</span></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.reference}>
                    <td className="font-mono text-xs text-ink-700">{p.reference}</td>
                    <td className="font-mono text-xs text-ink-600">
                      {p.rrr ?? <span className="text-ink-400">—</span>}
                    </td>
                    <td className="text-xs text-ink-600">{p.invoice ?? "—"}</td>
                    <td>
                      <span className="chip">
                        <Icon name="wallet" className="h-3 w-3" /> {p.gateway}
                      </span>
                    </td>
                    <td className="text-right font-semibold">{formatNaira(p.amount)}</td>
                    <td className="text-xs text-ink-600">{p.paidAt ? formatDate(p.paidAt) : "—"}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="text-right">
                      {p.status === "SUCCESSFUL" && p.receiptUrl ? (
                        <Link
                          href={p.receiptUrl}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900 hover:underline"
                        >
                          <Icon name="printer" className="h-3.5 w-3.5" /> Receipt
                        </Link>
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
