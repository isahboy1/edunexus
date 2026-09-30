import { redirect } from "next/navigation";
import { getSessionUser, hasRole, primaryRoleLabel } from "@/lib/auth";
import { PortalShell } from "@/components/PortalShell";
import { getBranding, resolveLogoUrl } from "@/lib/settings";

export const metadata = { title: "Lecturer Portal" };

export default async function LecturerLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/lecturer/results");
  // Lecturers only; staff can preview but applicants/students are bounced.
  if (!hasRole(user, "LECTURER", "SUPER_ADMIN", "REGISTRAR", "ACADEMIC_OFFICER", "HOD")) {
    if (hasRole(user, "STUDENT", "APPLICANT")) redirect("/");
    redirect("/login");
  }

  const roleLabel = primaryRoleLabel(user.roles);
  const logoUrl = resolveLogoUrl(await getBranding());

  return (
    <PortalShell
      portal="Lecturer Portal"
      logoUrl={logoUrl}
      subtitle="Course results workspace"
      userName={user.name}
      userEmail={user.email}
      roleLabel={roleLabel === "Member" ? "Lecturer" : roleLabel}
      nav={[
        { href: "/lecturer/results", label: "Results Entry", icon: "book" },
      ]}
    >
      {children}
    </PortalShell>
  );
}
