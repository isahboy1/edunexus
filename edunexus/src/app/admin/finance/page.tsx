import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PageHeader, SectionCard, Alert, EmptyState } from "@/components/ui";
import { formatNaira, formatEnum } from "@/lib/format";
import { ExportCsvButton } from "./export-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance Summary — Bursary" };

type Daily = { day: string; count: number; total: number };
type ByType = { type: string; invoices: number; billed: number; paid: number; outstanding: number };
type ByLevel = { level: number | null; students: number; outstanding: number };

type Summary = {
  totals: {
    billed: number;
    paid: number;
    outstanding: number;
    confirmedLast: number;
    confirmedCountLast: number;
    days: number;
  };
  daily: Daily[];
  byType: ByType[];
  byLevel: ByLevel[];
};

export default async function FinanceSummaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const days = Math.min(90, Math.max(1, Number(sp.days) || 14));

  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/finance");
  if (!hasRole(user, "SUPER_ADMIN", "BURSARY_OFFICER", "REGISTRAR")) redirect("/admin/dashboard");

  const res = await serverApi<Summary>(`/admin/finance-summary?days=${days}`);
  const s = res.data;

  const peak = Math.max(1, ...(s?.daily ?? []).map((d) => d.total));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Bursary"
        title="Finance Summary"
        description="Confirmed payments, invoice performance and outstanding balances across the institution."
        icon="chart"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-line-strong">
              {[7, 14, 30].map((d) => (
                <Link
                  key={d}
                  href={`/admin/finance?days=${d}`}
                  className={`px-3 py-2 text-xs font-semibold transition ${
                    d === days ? "bg-brand-700 text-white" : "bg-white text-ink-600 hover:bg-brand-50"
                  }`}
                  aria-current={d === days ? "true" : undefined}
                >
                  {d}d
                </Link>
              ))}
            </div>
            <ExportCsvButton days={days} />
          </div>
        }
      />

      {!res.ok && <Alert kind="error">{res.message}</Alert>}

      {s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total billed" value={formatNaira(s.totals.billed)} hint="Non-cancelled invoices" />
            <StatCard label="Collected" value={formatNaira(s.totals.paid)} hint="Allocated to invoices" tone />
            <StatCard
              label="Outstanding"
              value={formatNaira(s.totals.outstanding)}
              hint="Across all students"
              danger
            />
            <StatCard
              label={`Confirmed (${s.totals.days}d)`}
              value={formatNaira(s.totals.confirmedLast)}
              hint={`${s.totals.confirmedCountLast} payment${s.totals.confirmedCountLast === 1 ? "" : "s"} — fees + application`}
            />
          </div>

          <SectionCard
            title="Confirmed payments per day"
            subtitle={`School fees + application fees, last ${s.totals.days} days`}
            icon="chart"
            padded={false}
          >
            <div className="overflow-x-auto">
              <div className="flex min-w-[640px] items-end gap-2 px-5 pb-5 pt-4" style={{ height: 220 }}>
                {s.daily.map((d) => (
                  <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className={`w-full rounded-t-sm transition-all ${d.total > 0 ? "bg-brand-700" : "bg-slate-100"}`}
                        style={{ height: `${Math.max(3, (d.total / peak) * 100)}%` }}
                        title={`${d.day}: ${formatNaira(d.total)} (${d.count} payment${d.count === 1 ? "" : "s"})`}
                      />
                    </div>
                    <span className="w-full truncate text-center text-[9px] text-ink-400">{d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard title="Invoices by type" subtitle="Whole ledger, non-cancelled" icon="receipt" padded={false}>
              {s.byType.length === 0 ? (
                <div className="p-5">
                  <EmptyState icon="receipt" title="No invoices yet" description="Raise invoices to see ledger totals." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th className="text-right">Invoices</th>
                        <th className="text-right">Billed</th>
                        <th className="text-right">Paid</th>
                        <th className="text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.byType.map((t) => (
                        <tr key={t.type}>
                          <td className="font-semibold text-ink-900">{formatEnum(t.type)}</td>
                          <td className="text-right">{t.invoices}</td>
                          <td className="text-right">{formatNaira(t.billed)}</td>
                          <td className="text-right text-ink-600">{formatNaira(t.paid)}</td>
                          <td className={`text-right font-semibold ${t.outstanding > 0 ? "text-red-700" : "text-ink-600"}`}>
                            {formatNaira(t.outstanding)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Outstanding by level" subtitle="Students with a live balance" icon="layers" padded={false}>
              {s.byLevel.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon="checkCircle"
                    title="Nothing outstanding"
                    description="Every invoice across all levels is fully settled."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Level</th>
                        <th className="text-right">Students</th>
                        <th className="text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.byLevel.map((l) => (
                        <tr key={l.level ?? "unassigned"}>
                          <td className="font-semibold text-ink-900">{l.level !== null ? `Level ${l.level}` : "Unassigned"}</td>
                          <td className="text-right">{l.students}</td>
                          <td className="text-right font-semibold text-red-700">{formatNaira(l.outstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, hint, tone, danger }: { label: string; value: string; hint: string; tone?: boolean; danger?: boolean }) {
  return (
    <div className={`card-flush rounded-lg p-5 ${danger ? "border-red-200" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${danger ? "text-red-700" : tone ? "text-accent-700" : "text-brand-900"}`}>{value}</p>
      <p className="mt-1 text-xs text-ink-400">{hint}</p>
    </div>
  );
}
