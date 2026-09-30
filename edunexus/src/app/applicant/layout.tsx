import { redirect } from "next/navigation";
import { getSessionUser, hasRole, primaryRoleLabel } from "@/lib/auth";
import { PortalShell, type PortalNavItem } from "@/components/PortalShell";
import { getBranding, resolveLogoUrl } from "@/lib/settings";

export const metadata = { title: "Applicant Portal" };

const NAV: PortalNavItem[] = [
  { href: "/applicant/dashboard", label: "My Dashboard", icon: "grid", exact: true },
  { href: "/applicant/apply", label: "My Application", icon: "file" },
  { href: "/applicant/admission", label: "Admission Status", icon: "cap" },
];

export default async function ApplicantLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/applicant/dashboard");
  if (!hasRole(user, "APPLICANT") && !hasRole(user, "STUDENT")) {
    const staff = ["SUPER_ADMIN", "ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER", "ACADEMIC_OFFICER", "BURSARY_OFFICER", "HOD"];
    if (user.roles.some((r) => staff.includes(r))) redirect("/admin/dashboard");
    redirect("/login");
  }

  const roleLabel = primaryRoleLabel(user.roles);
  const logoUrl = resolveLogoUrl(await getBranding());

  return (
    <PortalShell
      portal="Applicant Portal"
      subtitle="Admissions application workspace"
      userName={user.name}
      userEmail={user.email}
      roleLabel={roleLabel === "Member" ? "Applicant" : roleLabel}
      logoUrl={logoUrl}
      nav={NAV}
    >
      {children}
    </PortalShell>
  );
}
