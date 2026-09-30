import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PageHeader, SectionCard, EmptyState, Alert, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatEnum } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Students — Admin" };

type Row = {
  id: string;
  matricNumber: string;
  currentLevelValue: number;
  status: string;
  entryType?: string | null;
  user?: { name?: string; email?: string } | null;
  currentProgramme?: { name?: string; code?: string } | null;
};

type Paginator = { data: Row[]; total: number; currentPage: number; lastPage: number };

const LEVELS = ["100", "200", "300", "400"];

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/students");
  if (!hasRole(user, "SUPER_ADMIN", "REGISTRAR", "ACADEMIC_OFFICER", "BURSARY_OFFICER")) redirect("/admin/dashboard");

  const page = Math.max(Number(sp.page ?? 1), 1);
  const qs = new URLSearchParams({ page: String(page), perPage: "20" });
  if (sp.level) qs.set("level", sp.level);
  if (sp.q) qs.set("q", sp.q);

  const res = await serverApi<Paginator>(`/admin/students?${qs.toString()}`);
  const rows = res.data?.data ?? [];
  const total = res.data?.total ?? 0;
  const pages = res.data?.lastPage ?? 1;

  const pageHref = (n: number) => {
    const p = new URLSearchParams({ page: String(n) });
    if (sp.level) p.set("level", sp.level);
    if (sp.q) p.set("q", sp.q);
    return `/admin/students?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Academics"
        title="Students"
        description="Directory of enrolled students. Open a student to view and print their academic transcript."
        icon="cap"
      />

      {!res.ok && <Alert kind="error">{res.message}</Alert>}

      <form className="card-flush flex flex-wrap items-end gap-3 p-5" method="get">
        <div className="min-w-[160px]">
          <label htmlFor="level" className="label">Level</label>
          <select id="level" name="level" className="input mt-1" defaultValue={sp.level ?? ""}>
            <option value="">All levels</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l} Level</option>)}
          </select>
        </div>
        <div className="min-w-[240px] flex-1">
          <label htmlFor="q" className="label">Search</label>
          <input id="q" name="q" className="input mt-1" placeholder="Matric no. or name" defaultValue={sp.q ?? ""} />
        </div>
        <button className="btn-primary" type="submit"><Icon name="search" className="h-4 w-4" /> Search</button>
        {(sp.level || sp.q) && <a className="btn-ghost" href="/admin/students">Clear</a>}
      </form>

      <SectionCard title="Enrolled students" subtitle={`${total} record${total === 1 ? "" : "s"}`} icon="cap" padded={false}>
        {rows.length === 0 ? (
          <EmptyState icon="cap" title="No students match" description="Students appear here after accepting admission." />
        ) : (
          <>
            <div className="overflow-x-auto" role="region" aria-label="Student directory" tabIndex={0}>
              <table className="table-base min-w-[820px]">
                <caption className="sr-only">Enrolled students with programme, level and transcript links</caption>
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Matric no.</th>
                    <th scope="col">Programme</th>
                    <th scope="col">Level</th>
                    <th scope="col">Entry</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="sr-only">Transcript</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="font-medium text-ink-900">{s.user?.name ?? "—"}</div>
                        <div className="text-xs text-ink-600">{s.user?.email ?? ""}</div>
                      </td>
                      <td className="font-mono text-xs text-ink-700">{s.matricNumber}</td>
                      <td className="text-sm">
                        <div>{s.currentProgramme?.code ?? "—"}</div>
                        <div className="max-w-[200px] truncate text-xs text-ink-600">{s.currentProgramme?.name ?? ""}</div>
                      </td>
                      <td className="tabular-nums">{s.currentLevelValue}</td>
                      <td className="text-xs text-ink-600">{formatEnum(s.entryType)}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td className="text-right">
                        <Link className="btn-outline btn-sm" href={`/admin/students/${s.id}/transcript`} aria-label={`Transcript for ${s.user?.name ?? s.matricNumber}`}>
                          Transcript
                        </Link>
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
