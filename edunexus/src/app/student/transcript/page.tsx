import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PageHeader, SectionCard, EmptyState, Alert } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Transcript — Student" };

type CourseRow = {
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
  student: { name: string | null; matric: string | null; programme: string | null; award: string | null; level: number };
  sessions: SessionGroup[];
  cumulative: { creditUnits: number; cgpa: number | null };
};

export default async function StudentTranscriptPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/student/transcript");
  if (!hasRole(user, "STUDENT", "SUPER_ADMIN", "REGISTRAR", "ACADEMIC_OFFICER")) redirect("/student/dashboard");

  const res = await serverApi<Transcript>("/student/transcript");
  const t = res.data;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Academic Record"
        title="My Transcript"
        description={t?.student ? `${t.student.name ?? ""} · ${t.student.matric ?? ""} · ${t.student.programme ?? ""}` : "Your published academic results."}
        icon="book"
      />

      {!res.ok && <Alert kind="error">{res.message}</Alert>}

      {res.ok && (t?.sessions?.length ?? 0) === 0 ? (
        <SectionCard title="No published results yet" subtitle="Check back later" icon="book">
          <EmptyState
            icon="book"
            title="Results will appear here once published"
            description="Your lecturers enter scores, the HOD approves them, and the registry publishes them. Only published results show on your transcript."
          />
        </SectionCard>
      ) : (
        t && (
          <>
            <section aria-label="Cumulative summary" className="grid gap-3 sm:grid-cols-3">
              <div className="card-flush p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-600">Credits earned</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-brand-900">{t.cumulative.creditUnits}</p>
              </div>
              <div className="card-flush p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-600">CGPA</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-brand-900">{t.cumulative.cgpa ?? "—"}</p>
              </div>
              <div className="card-flush p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-600">Current level</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-brand-900">{t.student.level}</p>
              </div>
            </section>

            {t.sessions.map((g) => (
              <SectionCard
                key={`${g.session}-${g.semester}`}
                title={`${g.session} — ${g.semester === "FIRST" ? "First" : "Second"} semester`}
                subtitle={`${g.creditUnits} credit units · GPA ${g.gpa ?? "—"}`}
                icon="book"
                padded={false}
              >
                <div className="overflow-x-auto" role="region" aria-label={`Courses for ${g.session} ${g.semester}`} tabIndex={0}>
                  <table className="table-base min-w-[680px]">
                    <caption className="sr-only">Published course results</caption>
                    <thead>
                      <tr>
                        <th scope="col">Code</th>
                        <th scope="col">Title</th>
                        <th scope="col">Units</th>
                        <th scope="col">CA</th>
                        <th scope="col">Exam</th>
                        <th scope="col">Total</th>
                        <th scope="col">Grade</th>
                        <th scope="col">GP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.courses.map((c) => (
                        <tr key={`${g.session}-${g.semester}-${c.code}`}>
                          <td className="font-mono text-xs text-ink-700">{c.code}</td>
                          <td className="max-w-[260px] truncate">{c.title}</td>
                          <td className="tabular-nums">{c.creditUnits}</td>
                          <td className="tabular-nums">{c.ca}</td>
                          <td className="tabular-nums">{c.exam}</td>
                          <td className="font-semibold tabular-nums">{c.total}</td>
                          <td><span className="badge-gray">{c.grade ?? "—"}</span></td>
                          <td className="tabular-nums">{c.gradePoint}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            ))}
          </>
        )
      )}
    </div>
  );
}
