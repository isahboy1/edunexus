import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PageHeader, SectionCard, EmptyState, Alert } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Academic Transcript — Admin" };

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
type SessionGroup = {
  session: string;
  semester: string;
  courses: CourseRow[];
  creditUnits: number;
  gpa: number | null;
};
type Transcript = {
  student: {
    id: string;
    name: string | null;
    matric: string | null;
    programme: string | null;
    award: string | null;
    level: number;
    status: string;
  };
  sessions: SessionGroup[];
  cumulative: { creditUnits: number; cgpa: number | null };
};

export default async function TranscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/admin/students/${id}/transcript`);
  if (!hasRole(user, "SUPER_ADMIN", "REGISTRAR", "ACADEMIC_OFFICER")) redirect("/admin/dashboard");

  const res = await serverApi<Transcript>(`/admin/students/${id}/transcript`);
  if (res.status === 404) notFound();
  if (!res.ok || !res.data) {
    return (
      <div className="space-y-5">
        <Alert kind="error">{res.message || "Could not load the transcript."}</Alert>
      </div>
    );
  }

  const t = res.data;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Academics"
        title="Academic Transcript"
        description={`${t.student.name ?? "Student"} · ${t.student.matric ?? "—"} · ${t.student.programme ?? "—"}`}
        icon="book"
        actions={
          <Link href={`/admin/students/${id}/transcript/print`} className="btn-primary">
            Print version
          </Link>
        }
      />

      {t.sessions.length === 0 ? (
        <SectionCard title="No published results" subtitle="Transcript unavailable" icon="book">
          <EmptyState
            icon="book"
            title="Nothing published yet"
            description="Only PUBLISHED results appear on transcripts. Approve and publish results from the Result Approval page."
          />
        </SectionCard>
      ) : (
        <>
          <section aria-label="Cumulative summary" className="grid gap-3 sm:grid-cols-3">
            <div className="card-flush p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-600">Cumulative credit units</p>
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
                      <tr key={c.id}>
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
      )}
    </div>
  );
}
