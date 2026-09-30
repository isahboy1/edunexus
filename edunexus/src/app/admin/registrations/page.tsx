import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PageHeader, SectionCard, EmptyState, Alert, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { RegistrationActions } from "./registration-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Course Registration Approvals — Admin" };

type Row = {
  id: string;
  status: string;
  totalCreditUnits: number;
  submittedAt: string | null;
  student: { matricNumber: string; user?: { name?: string } | null; currentProgramme?: { name?: string; code?: string } | null };
  items: { id: string; course: { code: string; title: string; creditUnits: number } }[];
};

type Paginator = { data: Row[]; total: number; currentPage: number; lastPage: number };

const STATUSES = ["SUBMITTED", "HOD_APPROVED", "APPROVED", "REJECTED"];

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/registrations");
  if (!hasRole(user, "SUPER_ADMIN", "REGISTRAR", "ACADEMIC_OFFICER", "HOD")) redirect("/admin/dashboard");

  const page = Math.max(Number(sp.page ?? 1), 1);
  const qs = new URLSearchParams({ page: String(page), perPage: "20" });
  if (sp.status) qs.set("status", sp.status);

  const res = await serverApi<Paginator>(`/admin/registrations?${qs.toString()}`);
  const rows = res.data?.data ?? [];
  const total = res.data?.total ?? 0;
  const pages = res.data?.lastPage ?? 1;

  const pageHref = (n: number) =>
    `/admin/registrations?page=${n}${sp.status ? `&status=${encodeURIComponent(sp.status)}` : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Academics"
        title="Course Registration Approvals"
        description="Two-step approval: HOD reviews submitted registrations, Academic Officer / Registrar gives final approval."
        icon="clipboard"
      />

      {!res.ok && <Alert kind="error">{res.message}</Alert>}

      <form className="card-flush flex flex-wrap items-end gap-3 p-5" method="get">
        <div className="min-w-[200px]">
          <label htmlFor="status" className="label">Status</label>
          <select id="status" name="status" className="input mt-1" defaultValue={sp.status ?? ""}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary" type="submit"><Icon name="filter" className="h-4 w-4" /> Filter</button>
        {sp.status && <a className="btn-ghost" href="/admin/registrations">Clear</a>}
      </form>

      <SectionCard title="Queue" subtitle={`${total} registration${total === 1 ? "" : "s"}`} icon="clipboard" padded={false}>
        {rows.length === 0 ? (
          <EmptyState icon="clipboard" title="Nothing in the queue" description="Student submissions will appear here for approval." />
        ) : (
          <>
            <div className="overflow-x-auto" role="region" aria-label="Registration queue" tabIndex={0}>
              <table className="table-base min-w-[820px]">
                <caption className="sr-only">Course registrations awaiting approval</caption>
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Courses</th>
                    <th scope="col">Units</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="font-medium text-ink-900">{r.student?.user?.name ?? "—"}</div>
                        <div className="text-xs text-ink-600">
                          {r.student?.matricNumber} · {r.student?.currentProgramme?.code ?? "—"}
                        </div>
                      </td>
                      <td className="max-w-[260px]">
                        <div className="truncate text-xs text-ink-700">
                          {(r.items ?? []).map((i) => i.course?.code).filter(Boolean).join(", ")}
                        </div>
                      </td>
                      <td className="tabular-nums">{r.totalCreditUnits ?? 0}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="text-right">
                        <RegistrationActions
                          id={r.id}
                          status={r.status}
                          studentName={r.student?.user?.name ?? r.student?.matricNumber ?? "this student"}
                        />
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
