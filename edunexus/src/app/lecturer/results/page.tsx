import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PageHeader, SectionCard, EmptyState, Alert } from "@/components/ui";
import { ResultsEntryClient, type LecturerCourse } from "./results-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Results Entry — Lecturer" };

export default async function LecturerResultsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/lecturer/results");
  if (!hasRole(user, "LECTURER", "SUPER_ADMIN", "REGISTRAR", "ACADEMIC_OFFICER", "HOD")) redirect("/");

  const res = await serverApi<{ semester: { id: string; name: string; session: string } | null; courses: LecturerCourse[] }>("/lecturer/courses");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Lecturer"
        title="Results Entry"
        description="Enter CA (max 40) and exam (max 60) scores for your assigned courses. Save drafts as you go, then submit the course for HOD approval."
        icon="book"
      />

      {!res.ok && <Alert kind="error">{res.message}</Alert>}

      {res.data?.courses?.length === 0 || !res.data ? (
        <SectionCard title="No assigned courses" subtitle="Current semester" icon="book">
          <EmptyState
            icon="book"
            title="Nothing assigned yet"
            description="You will see course rosters here once the registry assigns you courses for the semester."
          />
        </SectionCard>
      ) : (
        <ResultsEntryClient
          semesterName={res.data.semester ? `${res.data.semester.session} — ${res.data.semester.name} semester` : null}
          courses={res.data.courses}
        />
      )}
    </div>
  );
}
