import { redirect } from "next/navigation";
import { getSessionUser, hasRole, isSubAdminOnly, canManageUsers } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PageHeader, SectionCard, EmptyState, Alert } from "@/components/ui";
import { UsersClient, type UserRow } from "./users-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "User Management — Admin" };

type Paginator = {
  data: (UserRow & { roles?: (string | { name?: string })[] })[];
  total: number;
  currentPage: number;
  lastPage: number;
};

/** Laravel returns roles as objects ({id, name}); reduce them to names. */
const toRoleNames = (roles: (string | { name?: string })[] | undefined): string[] =>
  (Array.isArray(roles) ? roles : [])
    .map((r) => (typeof r === "string" ? r : (r?.name ?? "")))
    .filter(Boolean);

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/users");
  // Sub-admins (ADMIN) and super admins manage users; other staff roles are
  // redirected to their dashboard.
  if (!canManageUsers(user) && !hasRole(user, "REGISTRAR")) redirect("/admin/dashboard");

  const subAdmin = isSubAdminOnly(user);
  const page = Math.max(Number(sp.page ?? 1), 1);
  const pageSize = 20;

  const qs = new URLSearchParams();
  if (sp.role) qs.set("role", sp.role);
  qs.set("page", String(page));
  qs.set("perPage", String(pageSize));

  const res = await serverApi<Paginator>(`/admin/users?${qs.toString()}`);
  const users: UserRow[] = (res.data?.data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone ?? null,
    status: u.status,
    lastLoginAt: u.lastLoginAt ?? null,
    roles: toRoleNames(u.roles),
  }));
  const total = res.data?.total ?? 0;
  const pages = res.data?.lastPage ?? 1;

  const hrefFor = (p: number) => {
    const q = new URLSearchParams();
    if (sp.role) q.set("role", sp.role);
    q.set("page", String(p));
    q.set("perPage", String(pageSize));
    return `/admin/users?${q.toString()}`;
  };
  const prevHref = page > 1 ? hrefFor(page - 1) : null;
  const nextHref = page < pages ? hrefFor(page + 1) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="User Management"
        title="Users & Access"
        description={
          subAdmin
            ? "Create staff accounts and reset passwords for non-privileged users."
            : "Create staff accounts, reset passwords and oversee every portal account."
        }
        icon="users"
      />

      {!res.ok && <Alert kind="error">{res.message}</Alert>}

      {subAdmin && (
        <Alert kind="info">
          You are signed in as a sub-administrator. You can create users and reset passwords for
          non-privileged accounts only — Super Admin, Administrator and Registrar accounts are
          outside your scope.
        </Alert>
      )}

      <SectionCard
        title="Directory"
        subtitle={`${total} account${total === 1 ? "" : "s"}${subAdmin ? " in your scope" : ""}`}
        icon="users"
        padded={false}
      >
        {users.length === 0 ? (
          <EmptyState
            icon="users"
            title="No users in this view"
            description={
              subAdmin
                ? "No non-privileged accounts yet. Create the first staff user to get started."
                : "No accounts match this filter yet."
            }
          />
        ) : (
          <UsersClient
            users={users}
            subAdmin={subAdmin}
            currentUserId={user.id}
            page={page}
            pages={pages}
            prevHref={prevHref}
            nextHref={nextHref}
            activeRole={sp.role}
          />
        )}
      </SectionCard>
    </div>
  );
}
