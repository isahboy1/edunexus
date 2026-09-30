import { redirect, notFound } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { ApplicationWizard } from "@/app/applicant/application/[id]/wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Application" };

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/applicant/application/${id}`);
  if (!hasRole(user, "APPLICANT", "STUDENT", "SUPER_ADMIN")) redirect("/");

  // Full dossier for the wizard (Laravel returns it at data directly).
  const res = await serverApi<Record<string, unknown>>(`/applicant/applications/${id}`);
  if (res.status === 404) notFound();
  if (!res.ok || !res.data) redirect("/applicant/dashboard");

  const application = res.data as Record<string, any>;

  // Applicant profile comes from /auth/me (Laravel nests it there).
  const me = await serverApi<Record<string, any>>("/auth/me");
  const applicant = me.data?.applicant;
  if (!applicant) redirect("/applicant/dashboard");

  // Application fee from the active admission window.
  const info = await serverApi<{ fee?: number }>("/public/admission-info");

  // Per-section readiness (missing-field hints + submit gate truth).
  const comp = await serverApi<{ ready: boolean; sections: { key: string; label: string; complete: boolean; missing: string[] }[]; problems: string[] }>(
    `/applicant/applications/${id}/completeness`
  );

  return (
    <ApplicationWizard
      application={JSON.parse(JSON.stringify(application))}
      applicant={JSON.parse(JSON.stringify({
        surname: applicant.surname ?? "",
        firstName: applicant.first_name ?? applicant.firstName ?? "",
        middleName: applicant.middle_name ?? applicant.middleName ?? null,
        dateOfBirth: applicant.date_of_birth ?? applicant.dateOfBirth ?? null,
        gender: applicant.gender ?? null,
        nationality: applicant.nationality ?? null,
        stateOfOrigin: applicant.state_of_origin ?? applicant.stateOfOrigin ?? null,
        lga: applicant.lga ?? null,
        address: applicant.address ?? null,
        phone: me.data?.phone ?? null,
      }))}
      fee={info.data?.fee ?? 0}
      completeness={comp.ok && comp.data ? comp.data : null}
    />
  );
}
