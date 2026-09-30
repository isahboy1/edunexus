import { redirect } from "next/navigation";
import { getSessionUser, hasRole, hasAnyRole, primaryRoleLabel, canManageUsers } from "@/lib/auth";
import { PortalShell, type PortalNavItem } from "@/components/PortalShell";
import { getBranding, resolveLogoUrl } from "@/lib/settings";

export const metadata = { title: "Administration" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/dashboard");
  if (!hasAnyRole(user) && !hasRole(user, "HOD")) redirect("/");

  const roleLabel = primaryRoleLabel(user.roles);

  // Role-aware navigation:
  //  - Admissions Queue: Super Admin, Registrar, Admissions Officer
  //  - Academics (Students, Promotion, Registrations, Results): Super Admin,
  //    Registrar, Academic Officer — HOD sees approval queues only
  //  - Bursary (Payments, Fees): Super Admin, Registrar, Bursary Officer
  //  - Users & Access: Super Admin + Admin (sub-admin, user management only)
  //  - Testimonials, System Settings & Audit Log: Super Admin + Registrar
  const academic = hasRole(user, "SUPER_ADMIN", "REGISTRAR", "ACADEMIC_OFFICER");
  const queues = hasRole(user, "SUPER_ADMIN", "REGISTRAR", "ACADEMIC_OFFICER", "HOD");
  const bursary = hasRole(user, "SUPER_ADMIN", "REGISTRAR", "BURSARY_OFFICER");

  const NAV: PortalNavItem[] = [
    { href: "/admin/dashboard", label: "Dashboard", icon: "grid", exact: true },
    ...(hasRole(user, "SUPER_ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER")
      ? [{ href: "/admin/applications", label: "Admissions Queue", icon: "file" } as PortalNavItem]
      : []),
    ...(academic
      ? [{ href: "/admin/students", label: "Students", icon: "cap" } as PortalNavItem]
      : []),
    ...(bursary
      ? [{ href: "/admin/payments", label: "Payment Verification", icon: "shield" } as PortalNavItem]
      : []),
    ...(bursary
      ? [{ href: "/admin/fees", label: "Fee Management", icon: "wallet" } as PortalNavItem]
      : []),
    ...(bursary
      ? [{ href: "/admin/finance", label: "Finance Summary", icon: "chart" } as PortalNavItem]
      : []),
    ...(queues
      ? [{ href: "/admin/registrations", label: "Registrations", icon: "clipboard" } as PortalNavItem]
      : []),
    ...(queues
      ? [{ href: "/admin/results", label: "Result Approval", icon: "book" } as PortalNavItem]
      : []),
    ...(academic
      ? [{ href: "/admin/promotion", label: "Promotion", icon: "layers" } as PortalNavItem]
      : []),
    ...(canManageUsers(user)
      ? [{ href: "/admin/users", label: "Users & Access", icon: "users" } as PortalNavItem]
      : []),
    ...(hasRole(user, "SUPER_ADMIN", "REGISTRAR")
      ? [
          { href: "/admin/testimonials", label: "Testimonials", icon: "sparkles" } as PortalNavItem,
          { href: "/admin/settings", label: "System Settings", icon: "sliders" } as PortalNavItem,
          { href: "/admin/audit", label: "Audit Log", icon: "list" } as PortalNavItem,
        ]
      : []),
  ];

  const logoUrl = resolveLogoUrl(await getBranding());

  return (
    <PortalShell
      portal="Administration"
      subtitle={`${roleLabel} workspace`}
      userName={user.name}
      userEmail={user.email}
      roleLabel={roleLabel}
      nav={NAV}
      showNotificationBell
      logoUrl={logoUrl}
    >
      {children}
    </PortalShell>
  );
}
