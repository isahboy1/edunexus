import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PageHeader, SectionCard, EmptyState, Alert, StatusBadge } from "@/components/ui";
import { formatNaira, formatDateTime } from "@/lib/format";
import { Icon } from "@/components/icons";
import { PaymentActions } from "./payment-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment Verification — Admin" };

type Row = {
  id: string;
  kind: "APPLICATION_FEE" | "SCHOOL_FEES";
  reference: string;
  rrr: string | null;
  amount: string | number;
  currency: string;
  status: string;
  gateway: string;
  createdAt: string | null;
  payer: string | null;
  context: string | null;
  programme: string | null;
};

type Paginator = { data: Row[]; total: number; currentPage: number; lastPage: number };

const STATUSES = ["PENDING", "PROCESSING", "SUCCESSFUL", "FAILED"];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/payments");
  if (!hasRole(user, "SUPER_ADMIN", "BURSARY_OFFICER", "REGISTRAR")) redirect("/admin/dashboard");

  const page = Math.max(Number(sp.page ?? 1), 1);
  const qs = new URLSearchParams({ page: String(page), perPage: "20" });
  if (sp.status) qs.set("status", sp.status);
  if (sp.q) qs.set("q", sp.q);

  const res = await serverApi<Paginator>(`/bursary/payments?${qs.toString()}`);
  const rows = res.data?.data ?? [];
  const total = res.data?.total ?? 0;
  const pages = res.data?.lastPage ?? 1;

  const pageHref = (n: number) => {
    const p = new URLSearchParams({ page: String(n) });
    if (sp.status) p.set("status", sp.status);
    if (sp.q) p.set("q", sp.q);
    return `/admin/payments?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Bursary"
        title="Payment Verification"
        description="The bursary checkpoint: confirm bank/RRR payments or re-query the gateway before issuing receipts. Every confirmation is audit-logged."
        icon="shield"
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
          <input id="q" name="q" className="input mt-1" placeholder="Reference or RRR" defaultValue={sp.q ?? ""} />
        </div>
        <button className="btn-primary" type="submit"><Icon name="search" className="h-4 w-4" /> Search</button>
        {(sp.status || sp.q) && <a className="btn-ghost" href="/admin/payments">Clear</a>}
      </form>

      <SectionCard title="Payments awaiting confirmation" subtitle={`${total} payment${total === 1 ? "" : "s"}`} icon="wallet" padded={false}>
        {rows.length === 0 ? (
          <EmptyState icon="wallet" title="No payments match" description="Payments appear here as applicants initiate them." />
        ) : (
          <>
            <div className="overflow-x-auto" role="region" aria-label="Payment queue" tabIndex={0}>
              <table className="table-base min-w-[900px]">
                <caption className="sr-only">Payments (application fees and school fees) with verification actions</caption>
                <thead>
                  <tr>
                    <th scope="col">Reference / RRR</th>
                    <th scope="col">Payer</th>
                    <th scope="col">Type</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Gateway</th>
                    <th scope="col">Status</th>
                    <th scope="col">Initiated</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="font-mono text-xs text-ink-700">{r.reference}</div>
                        {r.rrr && <div className="font-mono text-[11px] text-ink-400">{r.rrr}</div>}
                      </td>
                      <td>
                        <div className="font-medium">{r.payer ?? "—"}</div>
                        <div className="font-mono text-xs text-ink-600">{r.context ?? ""}</div>
                      </td>
                      <td className="text-sm text-ink-600">
                        <span className="badge badge-gray mr-1.5">{r.kind === "SCHOOL_FEES" ? "School fees" : "Application"}</span>
                        {r.programme ?? "—"}
                      </td>
                      <td className="font-semibold tabular-nums">{formatNaira(Number(r.amount))}</td>
                      <td><span className="badge-gray">{r.gateway === "mock" ? "Mock" : r.gateway === "remita" ? "Remita" : r.gateway}</span></td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="text-xs text-ink-600">{formatDateTime(r.createdAt)}</td>
                      <td className="text-right">
                        <PaymentActions reference={r.reference} status={r.status} amount={Number(r.amount)} />
                      </td>
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
