import { redirect } from "next/navigation";
import { getSessionUser, hasRole, primaryRoleLabel } from "@/lib/auth";
import { PortalShell, type PortalNavItem } from "@/components/PortalShell";
import { getBranding, resolveLogoUrl } from "@/lib/settings";

export const metadata = { title: "Student Portal" };

const NAV: PortalNavItem[] = [
  { href: "/student/dashboard", label: "Dashboard", icon: "grid", exact: true },
  { href: "/student/registration", label: "Course Registration", icon: "clipboard" },
  { href: "/student/fees", label: "Fees & Payments", icon: "wallet" },
  { href: "/student/transcript", label: "My Transcript", icon: "book" },
  { href: "/student/forms", label: "Registration Forms", icon: "printer" },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/student/dashboard");
  if (!hasRole(user, "STUDENT") && !hasAnyStaff(user.roles)) {
    if (hasRole(user, "APPLICANT")) redirect("/applicant/dashboard");
    redirect("/login");
  }

  const roleLabel = primaryRoleLabel(user.roles);
  const logoUrl = resolveLogoUrl(await getBranding());

  return (
    <PortalShell
      portal="Student Portal"
      subtitle="Academic session workspace"
      userName={user.name}
      userEmail={user.email}
      roleLabel={roleLabel === "Member" ? "Student" : roleLabel}
      nav={NAV}
      showNotificationBell
      logoUrl={logoUrl}
    >
      {children}
    </PortalShell>
  );
}

function hasAnyStaff(roles: string[]) {
  return roles.some((r) =>
    ["SUPER_ADMIN", "ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER", "ACADEMIC_OFFICER", "BURSARY_OFFICER", "HOD"].includes(r)
  );
}
