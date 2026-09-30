import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { formatDateTime } from "@/lib/format";
import { PageHeader, SectionCard, EmptyState, Alert } from "@/components/ui";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit Logs — Admin" };

type LogRow = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
};

type Paginator = { data: LogRow[]; total: number; lastPage: number };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/audit");
  if (!hasRole(user, "SUPER_ADMIN", "REGISTRAR")) redirect("/admin/dashboard");

  const page = Math.max(Number(sp.page ?? 1), 1);
  const pageSize = 30;
  const qs = new URLSearchParams({ page: String(page), perPage: String(pageSize) });
  if (sp.action) qs.set("action", sp.action);

  const res = await serverApi<Paginator>(`/admin/audit-logs?${qs.toString()}`);
  const logs = res.data?.data ?? [];
  const total = res.data?.total ?? 0;
  const pages = res.data?.lastPage ?? 1;

  const pageHref = (n: number) =>
    `/admin/audit?page=${n}${sp.action ? `&action=${encodeURIComponent(sp.action)}` : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Governance"
        title="Audit Log"
        description="Immutable, timestamped record of every sensitive action taken on the platform."
        icon="shield"
      />

      {!res.ok && <Alert kind="error">{res.message}</Alert>}

      <form className="card-flush flex flex-wrap items-end gap-3 p-5" method="get">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="action">Filter by action</label>
          <input
            id="action"
            name="action"
            className="input"
            placeholder="e.g. ADMISSION, PAYMENT, LOGIN"
            defaultValue={sp.action ?? ""}
          />
        </div>
        <button className="btn-primary" type="submit">
          <Icon name="filter" className="h-4 w-4" /> Filter
        </button>
        {sp.action && (
          <a className="btn-ghost" href="/admin/audit">
            Clear
          </a>
        )}
      </form>

      <SectionCard padded={false}>
        {logs.length === 0 ? (
          <EmptyState
            icon="list"
            title="No audit entries found"
            description={sp.action ? `Nothing recorded for “${sp.action}”.` : "Sensitive actions will appear here as they happen."}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>IP address</th></tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap text-xs text-ink-600">{formatDateTime(l.createdAt)}</td>
                      <td className="text-xs">
                        {l.user ? (
                          <>
                            <span className="font-semibold text-ink-900">{l.user.name}</span>
                            <span className="text-ink-400"> · {l.user.email}</span>
                          </>
                        ) : (
                          <span className="text-ink-400">system</span>
                        )}
                      </td>
                      <td><span className="badge-blue">{l.action}</span></td>
                      <td className="text-xs text-ink-600">
                        {l.entityType ?? "—"}
                        {l.entityId ? <span className="font-mono text-ink-400"> · {l.entityId.slice(0, 10)}…</span> : null}
                      </td>
                      <td className="font-mono text-xs text-ink-600">{l.ipAddress ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-3.5">
                <a
                  className={`btn-outline btn-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
                  href={pageHref(Math.max(page - 1, 1))}
                >
                  Previous
                </a>
                <span className="text-xs font-medium text-ink-600">
                  Page <span className="tabular-nums">{page}</span> of <span className="tabular-nums">{pages}</span> ·{" "}
                  <span className="tabular-nums">{total}</span> entries
                </span>
                <a
                  className={`btn-outline btn-sm ${page >= pages ? "pointer-events-none opacity-40" : ""}`}
                  href={pageHref(Math.min(page + 1, pages))}
                >
                  Next
                </a>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}
