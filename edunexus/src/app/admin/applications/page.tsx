import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PageHeader, SectionCard, EmptyState, Alert } from "@/components/ui";
import { FilterBar } from "./filter-bar";
import { QueueTable } from "./queue-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Applications — Admin" };

const STATUSES = ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "SCREENING", "ADMITTED", "REJECTED", "PAID", "DRAFT"];

type Row = {
  id: string;
  applicationNumber: string;
  applicationType: string;
  status: string;
  submittedAt: string | null;
  applicant: { surname: string; firstName: string; gender?: string | null; stateOfOrigin?: string | null };
  programme: { name: string; code: string; award?: string | null };
  academicSession: { name: string };
};

type Paginator = {
  data: Row[];
  total: number;
  currentPage: number;
  lastPage: number;
};

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/applications");
  if (!hasRole(user, "SUPER_ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER")) redirect("/admin/dashboard");

  const page = Math.max(Number(sp.page ?? 1), 1);
  const pageSize = 20;

  const qs = new URLSearchParams();
  if (sp.status) qs.set("status", sp.status);
  if (sp.programmeId) qs.set("programmeId", sp.programmeId);
  if (sp.type) qs.set("type", sp.type);
  if (sp.q) qs.set("q", sp.q);
  if (sp.readiness) qs.set("readiness", sp.readiness);
  qs.set("page", String(page));
  qs.set("perPage", String(pageSize));

  const [appsRes, programmesRes] = await Promise.all([
    serverApi<Paginator>(`/admin/applications?${qs.toString()}`),
    serverApi<{ id: string; name: string; code: string }[]>("/programmes"),
  ]);

  const applications = appsRes.data?.data ?? [];
  const total = appsRes.data?.total ?? 0;
  const pages = appsRes.data?.lastPage ?? 1;
  const programmes = programmesRes.data ?? [];

  const pageQs = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v && k !== "page") p.set(k, v);
    return `?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admissions"
        title="Admissions Queue"
        description={`${total} application${total === 1 ? "" : "s"} on file — review, shortlist and admit applicants.`}
        icon="file"
      />

      {!appsRes.ok && <Alert kind="error">{appsRes.message}</Alert>}

      <FilterBar programmes={programmes} statuses={STATUSES} />

      <SectionCard padded={false}>
        {applications.length === 0 ? (
          <EmptyState
            icon="search"
            title="No applications match these filters"
            description="Try clearing the status, programme or search filters to see more results."
          />
        ) : (
          <QueueTable
            rows={applications}
            page={page}
            pages={pages}
            prevHref={page > 1 ? pageQs({ page: String(page - 1) }) : null}
            nextHref={page < pages ? pageQs({ page: String(page + 1) }) : null}
          />
        )}
      </SectionCard>
    </div>
  );
}
