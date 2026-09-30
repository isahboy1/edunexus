import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PrintButton, AutoPrint } from "@/app/print/application/[id]/print-controls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Academic Transcript (Print)",
  robots: { index: false, follow: false },
};

type CourseRow = {
  id: string;
  code: string;
  title: string;
  creditUnits: number;
  ca: number;
  exam: number;
  total: number;
  grade: string | null;
  gradePoint: number;
};
type SessionGroup = { session: string; semester: string; courses: CourseRow[]; creditUnits: number; gpa: number | null };
type Transcript = {
  student: { id: string; name: string | null; matric: string | null; programme: string | null; award: string | null; level: number; status: string };
  sessions: SessionGroup[];
  cumulative: { creditUnits: number; cgpa: number | null };
};

export default async function TranscriptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/admin/students/${id}/transcript/print`);
  if (!hasRole(user, "SUPER_ADMIN", "REGISTRAR", "ACADEMIC_OFFICER")) redirect("/");

  const res = await serverApi<Transcript>(`/admin/students/${id}/transcript`);
  if (res.status === 404) notFound();
  if (!res.ok || !res.data) redirect(`/admin/students/${id}/transcript`);

  const t = res.data;

  return (
    <div className="mx-auto max-w-3xl bg-white p-10 print:p-0">
      <AutoPrint />
      <div className="mb-6 flex items-end justify-between gap-4 border-b-2 border-brand-900 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-600">EduNexus College</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-950">Academic Transcript</h1>
          <p className="mt-1 text-xs text-ink-600">Unofficial — generated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="print:hidden">
          <PrintButton />
        </div>
      </div>

      <dl className="print-row-wide">
        <div className="print-row"><span className="print-label">Name</span><span className="print-value">{t.student.name ?? "—"}</span></div>
        <div className="print-row"><span className="print-label">Matriculation no.</span><span className="print-value">{t.student.matric ?? "—"}</span></div>
        <div className="print-row"><span className="print-label">Programme</span><span className="print-value">{t.student.programme ?? "—"}{t.student.award ? ` (${t.student.award})` : ""}</span></div>
        <div className="print-row"><span className="print-label">Current level</span><span className="print-value">{t.student.level}</span></div>
        <div className="print-row"><span className="print-label">Status</span><span className="print-value">{t.student.status}</span></div>
      </dl>

      {t.sessions.length === 0 ? (
        <p className="mt-8 text-sm text-ink-600">No published results on record.</p>
      ) : (
        t.sessions.map((g) => (
          <section key={`${g.session}-${g.semester}`} className="mt-8">
            <h2 className="print-heading">
              {g.session} — {g.semester === "FIRST" ? "First" : "Second"} semester · GPA {g.gpa ?? "—"}
            </h2>
            <table className="mt-3 w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-ink-300 text-left">
                  <th className="py-1.5 pr-3 font-semibold">Code</th>
                  <th className="py-1.5 pr-3 font-semibold">Title</th>
                  <th className="py-1.5 pr-3 font-semibold text-right">Units</th>
                  <th className="py-1.5 pr-3 font-semibold text-right">CA</th>
                  <th className="py-1.5 pr-3 font-semibold text-right">Exam</th>
                  <th className="py-1.5 pr-3 font-semibold text-right">Total</th>
                  <th className="py-1.5 pr-3 font-semibold">Grade</th>
                  <th className="py-1.5 font-semibold text-right">GP</th>
                </tr>
              </thead>
              <tbody>
                {g.courses.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--line)]">
                    <td className="py-1.5 pr-3 font-mono">{c.code}</td>
                    <td className="py-1.5 pr-3">{c.title}</td>
                    <td className="py-1.5 pr-3 text-right">{c.creditUnits}</td>
                    <td className="py-1.5 pr-3 text-right">{c.ca}</td>
                    <td className="py-1.5 pr-3 text-right">{c.exam}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold">{c.total}</td>
                    <td className="py-1.5 pr-3">{c.grade ?? "—"}</td>
                    <td className="py-1.5 text-right">{c.gradePoint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}

      <div className="mt-10 flex items-end justify-between border-t-2 border-brand-900 pt-4">
        <div>
          <p className="text-sm font-bold text-brand-950">Cumulative: {t.cumulative.creditUnits} credit units · CGPA {t.cumulative.cgpa ?? "—"}</p>
        </div>
        <div className="text-center">
          <div className="h-10 w-48 border-b border-ink-400" />
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-ink-600">Registrar</p>
        </div>
      </div>
    </div>
  );
}
