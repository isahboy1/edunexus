import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PageHeader, SectionCard, EmptyState, Alert, StatusBadge } from "@/components/ui";
import { formatNaira } from "@/lib/format";
import { Icon } from "@/components/icons";
import { ManualInvoiceForm } from "./invoice-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoices — Admin" };

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: string | number;
  amountPaid: string | number;
  balance: string | number;
  dueDate: string | null;
  student?: { matricNumber?: string; user?: { name?: string } | null } | null;
  academicSession?: { name?: string } | null;
};

type Paginator = { data: InvoiceRow[]; total: number; currentPage: number; lastPage: number; sessions?: { id: string; name: string; isCurrent?: boolean }[] };

const STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "CANCELLED"];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/invoices");
  if (!hasRole(user, "SUPER_ADMIN", "BURSARY_OFFICER", "REGISTRAR")) redirect("/admin/dashboard");

  const page = Math.max(Number(sp.page ?? 1), 1);
  const qs = new URLSearchParams({ page: String(page), perPage: "20" });
  if (sp.status) qs.set("status", sp.status);
  if (sp.q) qs.set("q", sp.q);

  const res = await serverApi<Paginator>(`/admin/invoices?${qs.toString()}`);
  const rows = res.data?.data ?? [];
  const total = res.data?.total ?? 0;
  const pages = res.data?.lastPage ?? 1;
  const sessions = res.data?.sessions ?? [];

  const canManage = hasRole(user, "SUPER_ADMIN", "BURSARY_OFFICER");

  const pageHref = (n: number) => {
    const p = new URLSearchParams({ page: String(n) });
    if (sp.status) p.set("status", sp.status);
    if (sp.q) p.set("q", sp.q);
    return `/admin/invoices?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Bursary"
        title="Invoices"
        description="School-fees ledger. Raise manual invoices for special cases; payments settle balances automatically."
        icon="receipt"
      />

      {!res.ok && <Alert kind="error">{res.message}</Alert>}

      <form className="card-flush flex flex-wrap items-end gap-3 p-5" method="get">
        <div className="min-w-[180px]">
          <label htmlFor="status" className="label">Status</label>
          <select id="status" name="status" className="input mt-1" defaultValue={sp.status ?? ""}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
          </select>
        </div>
        <div className="min-w-[240px] flex-1">
          <label htmlFor="q" className="label">Search</label>
          <input id="q" name="q" className="input mt-1" placeholder="Invoice no., matric or name" defaultValue={sp.q ?? ""} />
        </div>
        <button className="btn-primary" type="submit"><Icon name="search" className="h-4 w-4" /> Search</button>
        {(sp.status || sp.q) && <a className="btn-ghost" href="/admin/invoices">Clear</a>}
      </form>

      {canManage && sessions.length > 0 && <ManualInvoiceForm sessions={sessions.map((s) => ({ value: s.id, label: s.name }))} />}

      <SectionCard title="Ledger" subtitle={`${total} invoice${total === 1 ? "" : "s"}`} icon="receipt" padded={false}>
        {rows.length === 0 ? (
          <EmptyState icon="receipt" title="No invoices found" description="Invoices appear when students accept admission or are raised manually." />
        ) : (
          <>
            <div className="overflow-x-auto" role="region" aria-label="Invoice ledger" tabIndex={0}>
              <table className="table-base min-w-[860px]">
                <caption className="sr-only">School-fees invoice ledger</caption>
                <thead>
                  <tr>
                    <th scope="col">Invoice</th>
                    <th scope="col">Student</th>
                    <th scope="col">Session</th>
                    <th scope="col">Total</th>
                    <th scope="col">Paid</th>
                    <th scope="col">Balance</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id}>
                      <td className="font-mono text-xs text-ink-700">{i.invoiceNumber}</td>
                      <td>
                        <div className="font-medium">{i.student?.user?.name ?? "—"}</div>
                        <div className="text-xs text-ink-600">{i.student?.matricNumber ?? ""}</div>
                      </td>
                      <td className="text-sm">{i.academicSession?.name ?? "—"}</td>
                      <td className="tabular-nums">{formatNaira(Number(i.totalAmount))}</td>
                      <td className="tabular-nums">{formatNaira(Number(i.amountPaid))}</td>
                      <td className="font-semibold tabular-nums">{formatNaira(Number(i.balance))}</td>
                      <td><StatusBadge status={i.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--line)] bg-[#fcfdfb] px-5 py-3">
                {page > 1 ? <a href={pageHref(page - 1)} className="btn-outline btn-sm">Previous</a> : <span />}
                <span className="text-xs font-medium text-ink-600">Page {page} of {pages}</span>
                {page < pages ? <a href={pageHref(page + 1)} className="btn-outline btn-sm">Next</a> : <span />}
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}
