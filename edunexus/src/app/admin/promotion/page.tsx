import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PageHeader, SectionCard, EmptyState, Alert, StatCard } from "@/components/ui";
import { PromotionClient } from "./promotion-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Student Promotion — Admin" };

type Preview = {
  maxLevel: number;
  levels: { numericValue: number; name: string }[];
  byLevel: { levelValue: number; count: number }[];
  total: number;
};

export default async function PromotionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/promotion");
  if (!hasRole(user, "SUPER_ADMIN", "REGISTRAR", "ACADEMIC_OFFICER")) redirect("/admin/dashboard");

  const res = await serverApi<Preview>("/admin/promotion/preview");
  const data = res.data;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Academics"
        title="Student Promotion"
        description="Promote active cohorts to the next level at session rollover. Final-year students are never auto-promoted; every action is audit-logged."
        icon="cap"
      />

      {!res.ok && <Alert kind="error">{res.message}</Alert>}

      <section aria-label="Promotion overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active students" value={(data?.total ?? 0).toLocaleString()} icon="cap" tone="brand" hint="Across all levels" />
        {(data?.byLevel ?? [])
          .filter((l) => Number.isFinite(l?.levelValue))
          .slice(0, 3)
          .map((l) => (
            <StatCard
              key={l.levelValue}
              label={`${l.levelValue} Level`}
              value={l.count.toLocaleString()}
              icon="users"
              tone="slate"
              hint={`Next: ${Math.min(l.levelValue + 100, data?.maxLevel ?? 400)}`}
            />
          ))}
      </section>

      <SectionCard title="Cohorts" subtitle="Active students grouped by current level" icon="chart">
        {!res.ok || (data?.byLevel ?? []).length === 0 ? (
          <EmptyState icon="cap" title="No active students" description="Promotion becomes available once students are enrolled." />
        ) : (
          <PromotionClient
            byLevel={data!.byLevel}
            maxLevel={data!.maxLevel}
            levels={(data!.levels ?? []).map((l) => ({ value: String(l.numericValue), label: l.name }))}
          />
        )}
      </SectionCard>
    </div>
    );
}
