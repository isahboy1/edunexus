import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PageHeader, SectionCard, EmptyState, Alert, StatCard, StatusBadge } from "@/components/ui";
import { formatNaira } from "@/lib/format";
import { FeesClient } from "./fees-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fee Management — Admin" };

type Structure = {
  id: string;
  session: string | null;
  programme: string | null;
  programmeCode: string | null;
  levelValue: number;
  studentType: string;
  isActive: boolean;
  total: number;
  itemCount: number;
};
type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: string | number;
  amountPaid: string | number;
  balance: string | number;
  student?: { matricNumber?: string; user?: { name?: string } | null } | null;
};
type Options = {
  sessions: { id: string; name: string; isCurrent?: boolean }[];
  programmes: { id: string; name: string; code: string }[];
  levels: { numericValue: number; name: string }[];
};

export default async function FeesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/fees");
  if (!hasRole(user, "SUPER_ADMIN", "BURSARY_OFFICER", "REGISTRAR")) redirect("/admin/dashboard");

  const [feesRes, invoicesRes] = await Promise.all([
    serverApi<{ structures: Structure[]; invoiceStats: { status: string; n: number; total: string; balance: string }[]; options: Options }>("/admin/fees"),
    serverApi<{ data: InvoiceRow[]; total: number; lastPage: number; sessions: { id: string; name: string }[] }>("/admin/invoices?perPage=10"),
  ]);

  const structures = feesRes.data?.structures ?? [];
  const stats = feesRes.data?.invoiceStats ?? [];
  const options = feesRes.data?.options;
  const invoices = invoicesRes.data?.data ?? [];
  const invoiceSessions = invoicesRes.data?.sessions ?? [];

  const totalBilled = stats.reduce((s, x) => s + Number(x.total ?? 0), 0);
  const totalOutstanding = stats.reduce((s, x) => s + Number(x.balance ?? 0), 0);
  const paidCount = Number(stats.find((s) => s.status === "PAID")?.n ?? 0);
  const owingCount = Number(stats.find((s) => s.status === "UNPAID")?.n ?? 0) + Number(stats.find((s) => s.status === "PARTIALLY_PAID")?.n ?? 0);

  const canManage = hasRole(user, "SUPER_ADMIN", "BURSARY_OFFICER");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Bursary"
        title="Fee Management"
        description="Configure per-programme, per-level fee structures and monitor invoice settlement."
        icon="wallet"
      />

      {!feesRes.ok && <Alert kind="error">{feesRes.message}</Alert>}

      <section aria-label="Finance indicators" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total billed" value={formatNaira(totalBilled)} icon="wallet" tone="brand" hint="All invoices" />
        <StatCard label="Outstanding" value={formatNaira(totalOutstanding)} icon="alert" tone={totalOutstanding > 0 ? "amber" : "slate"} hint="Unsettled balances" />
        <StatCard label="Fully paid" value={paidCount.toLocaleString()} icon="checkCircle" tone="accent" hint="Invoices settled" />
        <StatCard label="Owing" value={owingCount.toLocaleString()} icon="clock" tone="slate" hint="Unpaid or partial" />
      </section>

      <SectionCard title="Fee structures" subtitle={`${structures.length} configured (session · programme · level)`} icon="layers" padded={false}>
        {structures.length === 0 ? (
          <EmptyState icon="layers" title="No fee structures yet" description="Create the first structure to bill students." />
        ) : (
          <FeesClient
            structures={structures.slice(0, 12)}
            canManage={canManage}
            sessions={(options?.sessions ?? invoiceSessions).map((s) => ({ value: s.id, label: s.name }))}
            programmes={(options?.programmes ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
            levels={(options?.levels ?? []).map((l) => ({ value: String(l.numericValue), label: l.name }))}
          />
        )}
      </SectionCard>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
        <SectionCard
          title="Recent invoices"
          subtitle={`${invoicesRes.data?.total ?? 0} total`}
          icon="receipt"
          padded={false}
          actions={<a href="/admin/invoices" className="btn-outline btn-sm">All invoices</a>}
        >
          {invoices.length === 0 ? (
            <EmptyState icon="receipt" title="No invoices yet" description="Invoices are raised when students accept admission or manually by the bursary." />
          ) : (
            <div className="overflow-x-auto" role="region" aria-label="Recent invoices" tabIndex={0}>
              <table className="table-base min-w-[640px]">
                <caption className="sr-only">Recent fee invoices</caption>
                <thead>
                  <tr>
                    <th scope="col">Invoice</th>
                    <th scope="col">Student</th>
                    <th scope="col">Total</th>
                    <th scope="col">Balance</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="font-mono text-xs text-ink-700">{i.invoiceNumber}</td>
                      <td>
                        <div className="font-medium">{i.student?.user?.name ?? "—"}</div>
                        <div className="text-xs text-ink-600">{i.student?.matricNumber ?? ""}</div>
                      </td>
                      <td className="tabular-nums">{formatNaira(Number(i.totalAmount))}</td>
                      <td className="tabular-nums">{formatNaira(Number(i.balance))}</td>
                      <td><StatusBadge status={i.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Invoice settlement" subtitle="Breakdown by status" icon="chart">
          {stats.length === 0 ? (
            <EmptyState icon="chart" title="No invoices yet" description="Settlement appears once invoices exist." />
          ) : (
            <ul className="space-y-4">
              {stats.map((s) => (
                <li key={s.status}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <StatusBadge status={s.status} />
                    <span className="text-sm font-bold tabular-nums text-ink-900">{s.n}</span>
                  </div>
                  <p className="text-[11px] text-ink-600">
                    {formatNaira(Number(s.total))} billed · {formatNaira(Number(s.balance))} outstanding
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
