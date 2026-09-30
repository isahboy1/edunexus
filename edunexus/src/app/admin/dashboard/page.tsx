import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, hasRole, isSubAdminOnly } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { StatusBadge, StatCard, PageHeader, SectionCard, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin Dashboard" };

type Stats = {
  students: { total: number };
  applications: { total: number; submitted: number; underReview: number; admitted: number; rejected: number };
  byStatus: Record<string, number>;
  payments: { successfulCount: number; revenue: number };
};

type RecentRow = {
  id: string;
  applicationNumber: string;
  status: string;
  applicant: { surname: string; firstName: string };
  programme: { name: string; code: string };
};

type Paginator = { data: RecentRow[]; total: number; currentPage: number; lastPage: number };

type UserRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  roles?: (string | { name?: string })[];
};

type UserPaginator = { data: UserRow[]; total: number; currentPage: number; lastPage: number };

type UserStats = {
  total: number;
  active: number;
  privileged: number;
  staff: number;
  roles: { name: string; count: number }[];
};

const EMPTY = { ok: false, status: 403, data: null, message: "", errors: {}, meta: {} } as const;

/** Server-safe label formatter (ui.tsx is a client module). */
const label = (s: string) =>
  s
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");

/** Fallback when the users-count API is unreachable. */
const FALLBACK_USERS: UserStats = { total: 0, active: 0, privileged: 0, staff: 0, roles: [] };

export default async function AdminDashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/dashboard");

  const subOnly = isSubAdminOnly(user);
  const isOfficer = hasRole(
    user,
    "SUPER_ADMIN",
    "REGISTRAR",
    "ADMISSIONS_OFFICER",
    "ACADEMIC_OFFICER",
    "BURSARY_OFFICER"
  );
  const canReviewQueue = hasRole(user, "SUPER_ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER");

  // ── Sub-admin dashboard: user management focus ──────────────
  if (subOnly) {
    const statsPromise = fetchUserStats();
    return <SubAdminDashboard userName={user.name.split(" ")[0]} statsPromise={statsPromise} />;
  }

  // ── Institutional overview (Super Admin & officers) ─────────
  const [statsRes, recentRes] = await Promise.all([
    isOfficer ? serverApi<Stats>("/admin/stats") : Promise.resolve(EMPTY),
    canReviewQueue
      ? serverApi<Paginator>("/admin/applications?perPage=8")
      : Promise.resolve(EMPTY),
  ]);

  const totals = statsRes.data;
  const statusCounts = Object.entries(totals?.byStatus ?? {}).sort((a, b) => b[1] - a[1]);
  const peak = Math.max(1, ...statusCounts.map(([, n]) => n));
  const recent = recentRes.data?.data ?? [];
  const awaiting = (totals?.applications.submitted ?? 0) + (totals?.applications.underReview ?? 0);
  const applicationTotal = totals?.applications.total ?? 0;
  const admitRate = applicationTotal > 0 ? Math.round(((totals?.applications.admitted ?? 0) / applicationTotal) * 100) : 0;

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description={`Institution activity for ${today}.`}
        icon="chart"
        actions={
          <>
            {canReviewQueue && (
              <Link href="/admin/applications" className="btn-outline">
                <Icon name="file" className="h-4 w-4" /> Admissions Queue
              </Link>
            )}
            {hasRole(user, "SUPER_ADMIN", "REGISTRAR") && (
              <Link href="/admin/settings" className="btn-primary">
                <Icon name="sliders" className="h-4 w-4" /> Configure
              </Link>
            )}
          </>
        }
      />

      {!statsRes.ok && statsRes.status !== 403 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {statsRes.message}
        </div>
      )}

      <section aria-label="Institution performance indicators" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Students"
          value={(totals?.students.total ?? 0).toLocaleString()}
          icon="cap"
          tone="accent"
          hint="Enrolled & active"
        />
        <StatCard
          label="Applications"
          value={(totals?.applications.total ?? 0).toLocaleString()}
          icon="file"
          tone="brand"
          hint="All sessions"
        />
        <StatCard
          label="Admitted"
          value={(totals?.applications.admitted ?? 0).toLocaleString()}
          icon="checkCircle"
          tone="slate"
          hint="Offers issued"
        />
        <StatCard
          label="Awaiting Review"
          value={awaiting.toLocaleString()}
          icon="clock"
          tone={awaiting > 0 ? "amber" : "slate"}
          hint="Submitted & under review"
        />
        <StatCard
          label="Application Fees"
          value={`₦${(totals?.payments.revenue ?? 0).toLocaleString()}`}
          icon="wallet"
          tone="accent"
          hint={`${totals?.payments.successfulCount ?? 0} verified payments`}
        />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(270px,0.85fr)]">
        <SectionCard
          className="min-w-0"
          title="Recent Applications"
          subtitle="Latest submissions across all programmes"
          icon="file"
          padded={false}
          actions={
            <Link href="/admin/applications" className="btn-outline btn-sm">
              View all <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {recent.length === 0 ? (
            <EmptyState
              icon="file"
              title="No applications yet"
              description="Applications will appear here as soon as applicants submit their dossier."
            />
          ) : (
            <div className="overflow-x-auto focus-visible:outline-offset-[-3px]" role="region" aria-label="Recent applications" tabIndex={0}>
              <table className="table-base min-w-[680px]">
                <caption className="sr-only">Most recent application submissions and review status</caption>
                <thead>
                  <tr>
                    <th scope="col">Application</th>
                    <th scope="col">Applicant</th>
                    <th scope="col">Programme</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((a) => (
                    <tr key={a.id}>
                      <td className="font-mono text-xs text-ink-700">{a.applicationNumber}</td>
                      <td className="font-medium">
                        {a.applicant?.surname} {a.applicant?.firstName}
                      </td>
                      <td className="max-w-[180px] truncate text-ink-600">{a.programme?.code}</td>
                      <td>
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="text-right">
                        <Link className="btn-outline btn-sm" aria-label={`Review application ${a.applicationNumber}`} href={`/admin/applications/${a.id}`}>
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Pipeline"
          subtitle="Applications by status"
          icon="layers"
        >
          <div className="mb-5 rounded-md border border-line bg-[#fbfcfa] p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-600">Offer conversion</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-brand-900">{admitRate}<span className="ml-0.5 text-sm font-medium text-ink-600">%</span></p>
              </div>
              <p className="pb-1 text-right text-[11px] text-ink-600">{(totals?.applications.admitted ?? 0).toLocaleString()} of {applicationTotal.toLocaleString()} applications</p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Offer conversion rate" aria-valuetext={`${admitRate} percent`} aria-valuenow={admitRate} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-accent-600" style={{ width: `${admitRate}%` }} />
            </div>
          </div>
          {statusCounts.length === 0 ? (
            <EmptyState icon="chart" title="No data yet" description="Status breakdown appears once applications exist." />
          ) : (
            <ul className="space-y-4">
              {statusCounts.map(([status, count]) => (
                <li key={status}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <StatusBadge status={status} />
                    <span className="text-sm font-bold tabular-nums text-ink-900">{count}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${status.replaceAll("_", " ")} applications`} aria-valuetext={`${count} applications`} aria-valuenow={count} aria-valuemin={0} aria-valuemax={peak}>
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(4, (count / peak) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <section aria-label="Administration shortcuts" className="grid gap-3 md:grid-cols-3">
        {[
          {
            href: "/admin/applications",
            icon: "file" as const,
            title: "Admissions",
            body: "Review, shortlist and admit applicants through the state machine.",
          },
          {
            href: "/admin/users",
            icon: "users" as const,
            title: "Users & Access",
            body: "Create staff accounts and reset portal passwords.",
          },
          {
            href: "/admin/audit",
            icon: "list" as const,
            title: "Audit Log",
            body: "Every privileged action, timestamped and attributed.",
          },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="card-hover group flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
              <Icon name={c.icon} className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-[15px] font-bold text-ink-900">{c.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">{c.body}</p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700">
              Open <Icon name="arrowRight" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}

/* ── Sub-admin (ADMIN-only) dashboard ─────────────────────────────── */

async function fetchUserStats(): Promise<UserStats> {
  const res = await serverApi<UserPaginator>("/admin/users?perPage=200");
  if (!res.ok || !res.data) return FALLBACK_USERS;
  const rows = res.data.data ?? [];
  const roleNames = (u: UserRow): string[] =>
    (Array.isArray(u.roles) ? u.roles : [])
      .map((r) => (typeof r === "string" ? r : (r?.name ?? "")))
      .filter(Boolean);
  const active = rows.filter((u) => u.status === "ACTIVE").length;
  const staff = rows.filter((u) => roleNames(u).length > 0 && !roleNames(u).some((r) => ["APPLICANT", "STUDENT"].includes(r))).length;
  const privileged = rows.filter((u) => roleNames(u).some((r) => ["SUPER_ADMIN", "ADMIN", "REGISTRAR"].includes(r))).length;
  const roleCounts = new Map<string, number>();
  for (const u of rows) for (const r of roleNames(u)) roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1);
  return {
    total: res.data.total ?? rows.length,
    active,
    staff,
    privileged,
    roles: [...roleCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
  };
}

async function SubAdminDashboard({
  userName,
  statsPromise,
}: {
  userName: string;
  statsPromise: Promise<UserStats>;
}) {
  const stats = await statsPromise;
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="User Administration"
        title={`Welcome back, ${userName}`}
        description={`Account activity for ${today}.`}
        icon="users"
        actions={
          <Link href="/admin/users" className="btn-primary">
            <Icon name="user" className="h-4 w-4" /> Users & Access
          </Link>
        }
      />

      <section aria-label="User management indicators" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Accounts"
          value={stats.total.toLocaleString()}
          icon="users"
          tone="brand"
          hint="In your management scope"
        />
        <StatCard
          label="Active"
          value={stats.active.toLocaleString()}
          icon="checkCircle"
          tone="accent"
          hint="Currently active accounts"
        />
        <StatCard
          label="Staff Roles"
          value={stats.staff.toLocaleString()}
          icon="cap"
          tone="slate"
          hint="Officers, HODs & lecturers"
        />
        <StatCard
          label="Privileged"
          value={stats.privileged.toLocaleString()}
          icon="shield"
          tone="slate"
          hint="Super Admin, Admin & Registrar"
        />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(270px,0.85fr)]">
        <SectionCard
          className="min-w-0"
          title="Accounts by role"
          subtitle="Where your user-management work concentrates"
          icon="chart"
        >
          {stats.roles.length === 0 ? (
            <EmptyState
              icon="users"
              title="No accounts yet"
              description="Create the first staff user from the Users & Access page."
            />
          ) : (
            <ul className="space-y-4">
              {stats.roles.map((r) => {
                const peak = Math.max(...stats.roles.map((x) => x.count));
                return (
                  <li key={r.name}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span className="badge-gray">{label(r.name)}</span>
                      <span className="text-sm font-bold tabular-nums text-ink-900">{r.count}</span>
                    </div>
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-label={`${label(r.name)} accounts`}
                      aria-valuenow={r.count}
                      aria-valuemin={0}
                      aria-valuemax={peak}
                    >
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(4, (r.count / peak) * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Your scope" subtitle="Sub-admin permissions" icon="shield">
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2.5">
              <Icon name="checkCircle" className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
              <span className="text-ink-700">Create staff accounts (non-privileged roles)</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Icon name="checkCircle" className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
              <span className="text-ink-700">Reset passwords for non-privileged users</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
              <span className="text-ink-600">Super Admin, Administrator and Registrar accounts are outside your scope.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
              <span className="text-ink-600">Admissions, system settings and audit logs are reserved for higher privileges.</span>
            </li>
          </ul>
          <Link href="/admin/users" className="btn-outline btn-sm mt-5 w-full justify-center">
            Open Users & Access <Icon name="arrowRight" className="h-3.5 w-3.5" />
          </Link>
        </SectionCard>
      </div>
    </div>
  );
}
