import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { Alert, PageHeader } from "@/components/ui";
import { RegistrationClient } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Course Registration — Student" };

export type EligibleCourse = {
  id: string;
  code: string;
  title: string;
  creditUnits: number;
  type: string;
  registered: boolean;
};

export type RegistrationState = {
  id: string;
  status: string;
  totalCreditUnits: number;
  submittedAt: string | null;
  items: { id: string; courseId: string; creditUnits: number; course?: { id: string; code: string; title: string; creditUnits?: number; credit_units?: number } }[];
} | null;

export default async function StudentRegistrationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/student/registration");
  if (!hasRole(user, "STUDENT")) redirect("/student/dashboard");

  const [eligibleRes, regRes] = await Promise.all([
    serverApi<{ semester: { id: string; name: string; status: string } | null; courses: EligibleCourse[] }>(
      "/student/courses/eligible"
    ),
    serverApi<RegistrationState>("/student/registration"),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Academics"
        title="Course Registration"
        description="Select your semester courses (12–24 credit units). Approval flows through your Head of Department."
        icon="clipboard"
      />

      {!eligibleRes.ok && <Alert kind="error">{eligibleRes.message}</Alert>}

      <RegistrationClient
        semester={eligibleRes.data?.semester ?? null}
        courses={eligibleRes.data?.courses ?? []}
        registration={regRes.data ?? null}
      />
    </div>
  );
}
