"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/laravel";
import { formatStatus, SectionCard } from "@/components/ui";
import { Icon } from "@/components/icons";

export type LecturerCourse = {
  assignmentId: string;
  courseId: string;
  code: string | null;
  title: string | null;
  creditUnits: number | null;
  enrolled: number;
  entered: number;
  resultStatus: string | null;
  results: {
    registrationId: string;
    studentId: string;
    matric: string | null;
    name: string | null;
    ca: number | string | null;
    exam: number | string | null;
    total: number | string | null;
    grade: string | null;
    status: string | null;
  }[];
};

function gradeFor(total: number): string {
  if (total >= 70) return "A";
  if (total >= 60) return "B";
  if (total >= 50) return "C";
  if (total >= 45) return "D";
  if (total >= 40) return "E";
  return "F";
}

export function ResultsEntryClient({
  semesterName,
  courses,
}: {
  semesterName: string | null;
  courses: LecturerCourse[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { kind: "ok" | "err"; text: string }>>({});
  // Editable draft values per course: { studentId: { ca, exam } }
  const [drafts, setDrafts] = useState<Record<string, Record<string, { ca: string; exam: string }>>>(() => {
    const initial: Record<string, Record<string, { ca: string; exam: string }>> = {};
    for (const c of courses) {
      initial[c.courseId] = {};
      for (const r of c.results) {
        initial[c.courseId][r.studentId] = { ca: r.ca != null ? String(r.ca) : "", exam: r.exam != null ? String(r.exam) : "" };
      }
    }
    return initial;
  });

  const setScore = (courseId: string, studentId: string, field: "ca" | "exam", value: string) => {
    setDrafts((d) => ({
      ...d,
      [courseId]: { ...d[courseId], [studentId]: { ...d[courseId]?.[studentId], [field]: value } },
    }));
  };

  const isLocked = (status: string | null) => status === "SUBMITTED" || status === "APPROVED" || status === "PUBLISHED";

  async function saveDraft(course: LecturerCourse) {
    setBusy(course.courseId);
    setMessages((m) => ({ ...m, [course.courseId]: undefined as never }));
    const rows = Object.entries(drafts[course.courseId] ?? {})
      .map(([studentId, v]) => ({ studentId, ca: Number(v.ca), exam: Number(v.exam) }))
      .filter((r) => Number.isFinite(r.ca) && Number.isFinite(r.exam) && (r.ca > 0 || r.exam > 0));
    if (rows.length === 0) {
      setMessages((m) => ({ ...m, [course.courseId]: { kind: "err", text: "Enter at least one CA/exam pair." } }));
      setBusy(null);
      return;
    }
    try {
      const res = await apiPost<{ saved: number }>(`/lecturer/courses/${course.courseId}/results`, { results: rows });
      setMessages((m) => ({
        ...m,
        [course.courseId]: res.ok
          ? { kind: "ok", text: `Saved ${res.data?.saved ?? rows.length} score(s) as draft.` }
          : { kind: "err", text: res.message || "Save failed." },
      }));
      if (res.ok) router.refresh();
    } catch {
      setMessages((m) => ({ ...m, [course.courseId]: { kind: "err", text: "Network error — please try again." } }));
    } finally {
      setBusy(null);
    }
  }

  async function submitCourse(course: LecturerCourse) {
    setBusy(`submit-${course.courseId}`);
    try {
      const res = await apiPost<{ submitted: number }>(`/lecturer/courses/${course.courseId}/results/submit`);
      setMessages((m) => ({
        ...m,
        [course.courseId]: res.ok
          ? { kind: "ok", text: `${res.data?.submitted ?? 0} result(s) submitted for approval.` }
          : { kind: "err", text: res.message || "Submit failed." },
      }));
      if (res.ok) router.refresh();
    } catch {
      setMessages((m) => ({ ...m, [course.courseId]: { kind: "err", text: "Network error — please try again." } }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {semesterName && <p className="text-sm font-medium text-ink-600">{semesterName}</p>}

      {courses.map((c) => {
        const locked = isLocked(c.resultStatus);
        const msg = messages[c.courseId];
        return (
          <SectionCard
            key={c.courseId}
            title={`${c.code ?? "Course"} — ${c.title ?? ""}`}
            subtitle={`${c.enrolled} enrolled · ${c.entered} entered · ${c.creditUnits ?? "—"} units${c.resultStatus ? ` · ${formatStatus(c.resultStatus)}` : ""}`}
            icon="book"
            padded={false}
          >
            <div className="px-5 py-4">
              {locked && (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                  Results are {formatStatus(c.resultStatus ?? "").toLowerCase()} and locked for editing.
                </p>
              )}
              {msg && (
                <div
                  className={`mb-3 rounded-lg px-4 py-2.5 text-sm ${msg.kind === "ok" ? "border border-green-200 bg-green-50 text-green-800" : "border border-red-200 bg-red-50 text-red-700"}`}
                  role={msg.kind === "ok" ? "status" : "alert"}
                >
                  {msg.text}
                </div>
              )}

              {c.results.length === 0 ? (
                <p className="text-sm text-ink-600">No students registered for this course yet.</p>
              ) : (
                <div className="overflow-x-auto" role="region" aria-label={`Score sheet for ${c.code}`} tabIndex={0}>
                  <table className="table-base min-w-[640px]">
                    <caption className="sr-only">Score sheet for {c.code}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Student</th>
                        <th scope="col">CA (40)</th>
                        <th scope="col">Exam (60)</th>
                        <th scope="col">Total</th>
                        <th scope="col">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.results.map((r) => {
                        const d = drafts[c.courseId]?.[r.studentId] ?? { ca: "", exam: "" };
                        const ca = Number(d.ca);
                        const exam = Number(d.exam);
                        const total = Number.isFinite(ca) && Number.isFinite(exam) && (d.ca !== "" || d.exam !== "") ? ca + exam : null;
                        return (
                          <tr key={r.studentId}>
                            <td>
                              <div className="font-medium text-ink-900">{r.name ?? "—"}</div>
                              <div className="font-mono text-xs text-ink-600">{r.matric ?? ""}</div>
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={40}
                                className="input h-9 w-24"
                                value={d.ca}
                                disabled={locked}
                                aria-label={`CA score for ${r.name ?? r.matric}`}
                                onChange={(e) => setScore(c.courseId, r.studentId, "ca", e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={60}
                                className="input h-9 w-24"
                                value={d.exam}
                                disabled={locked}
                                aria-label={`Exam score for ${r.name ?? r.matric}`}
                                onChange={(e) => setScore(c.courseId, r.studentId, "exam", e.target.value)}
                              />
                            </td>
                            <td className="font-semibold tabular-nums">{total ?? "—"}</td>
                            <td>{total !== null ? <span className="badge-gray">{gradeFor(total)}</span> : <span className="text-xs text-ink-400">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!locked && c.results.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn-outline" onClick={() => saveDraft(c)} disabled={busy !== null} aria-busy={busy === c.courseId}>
                    <Icon name="check" className="h-4 w-4" /> Save draft
                  </button>
                  <button type="button" className="btn-primary" onClick={() => submitCourse(c)} disabled={busy !== null} aria-busy={busy === `submit-${c.courseId}`}>
                    <Icon name="arrowRight" className="h-4 w-4" /> Submit for approval
                  </button>
                </div>
              )}
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
}
