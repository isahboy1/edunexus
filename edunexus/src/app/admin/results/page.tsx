import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PageHeader, SectionCard, EmptyState, Alert, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ResultActions } from "./result-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Result Approval — Admin" };

type Row = {
  id: string;
  status: string;
  caScore: string | number;
  examScore: string | number;
  totalScore: string | number;
  grade: string | null;
  gradePoint: string | number | null;
  student: { matricNumber: string; user?: { name?: string } | null } | null;
  course: { code: string; title: string; creditUnits: number } | null;
  semester: { name: string; academicSession?: { name?: string } | null } | null;
};

type Paginator = { data: Row[]; total: number; currentPage: number; lastPage: number };

const STATUSES = ["SUBMITTED", "APPROVED", "PUBLISHED", "REJECTED", "DRAFT"];

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/results");
  if (!hasRole(user, "SUPER_ADMIN", "REGISTRAR", "ACADEMIC_OFFICER", "HOD")) redirect("/admin/dashboard");

  const page = Math.max(Number(sp.page ?? 1), 1);
  const qs = new URLSearchParams({ page: String(page), perPage: "20" });
  if (sp.status) qs.set("status", sp.status);
  if (sp.q) qs.set("q", sp.q);

  const res = await serverApi<Paginator>(`/admin/results?${qs.toString()}`);
  const rows = res.data?.data ?? [];
  const total = res.data?.total ?? 0;
  const pages = res.data?.lastPage ?? 1;

  const pageHref = (n: number) => {
    const p = new URLSearchParams({ page: String(n) });
    if (sp.status) p.set("status", sp.status);
    if (sp.q) p.set("q", sp.q);
    return `/admin/results?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Academics"
        title="Result Approval"
        description="Approve submitted results, then publish approved results to students. Only published results appear on transcripts."
        icon="book"
      />

      {!res.ok && <Alert kind="error">{res.message}</Alert>}

      <form className="card-flush flex flex-wrap items-end gap-3 p-5" method="get">
        <div className="min-w-[180px]">
          <label htmlFor="status" className="label">Status</label>
          <select id="status" name="status" className="input mt-1" defaultValue={sp.status ?? ""}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <label htmlFor="q" className="label">Search student</label>
          <input id="q" name="q" className="input mt-1" placeholder="Matric no. or name" defaultValue={sp.q ?? ""} />
        </div>
        <button className="btn-primary" type="submit"><Icon name="search" className="h-4 w-4" /> Search</button>
        {sp.status && <a className="btn-ghost" href="/admin/results">Clear</a>}
      </form>

      <SectionCard title="Results ledger" subtitle={`${total} result${total === 1 ? "" : "s"}`} icon="book" padded={false}>
        {rows.length === 0 ? (
          <EmptyState
            icon="book"
            title="No results found"
            description="Lecturers enter results into the ledger; they appear here for approval once submitted."
          />
        ) : (
          <>
            <div className="overflow-x-auto" role="region" aria-label="Results ledger" tabIndex={0}>
              <table className="table-base min-w-[860px]">
                <caption className="sr-only">Course results with approval state machine actions</caption>
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Course</th>
                    <th scope="col">CA</th>
                    <th scope="col">Exam</th>
                    <th scope="col">Total</th>
                    <th scope="col">Grade</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="font-medium text-ink-900">{r.student?.user?.name ?? "—"}</div>
                        <div className="text-xs text-ink-600">{r.student?.matricNumber ?? "—"}</div>
                      </td>
                      <td>
                        <div className="font-mono text-xs text-ink-700">{r.course?.code ?? "—"}</div>
                        <div className="max-w-[180px] truncate text-xs text-ink-600">{r.course?.title ?? ""}</div>
                      </td>
                      <td className="tabular-nums">{Number(r.caScore ?? 0)}</td>
                      <td className="tabular-nums">{Number(r.examScore ?? 0)}</td>
                      <td className="font-semibold tabular-nums">{Number(r.totalScore ?? 0)}</td>
                      <td><span className="badge-gray">{r.grade ?? "—"}</span></td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="text-right">
                        <ResultActions id={r.id} status={r.status} courseCode={r.course?.code ?? "result"} />
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
