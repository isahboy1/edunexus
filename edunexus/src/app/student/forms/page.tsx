import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { Alert, StatusBadge, PageHeader, SectionCard } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PrintButton } from "./print-button";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Print Forms — Student" };

type Docs = {
  forms: { code: string; title: string; available: boolean; requires: string | null }[];
  registrationStatus: string | null;
  feesCleared: boolean;
};

type CrfSlip = {
  student: { name: string; matricNumber: string; programme: string | null; level: number };
  semester: string | null;
  session: string | null;
  registration: {
    status: string;
    totalCreditUnits: number;
    items: { id: string; creditUnits: number; course: { code: string; title: string; creditUnits: number; courseType?: string } }[];
  } | null;
  generatedAt: string;
};

// The printable forms the AKCILS registration procedure requires (SIF, CRF,
// Undertaking, Library form, Exam slip). CRF renders inline from the Laravel
// registration slip endpoint; the others print the same document shell with
// their own header/checklist content.
export default async function StudentFormsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/student/forms");
  if (!hasRole(user, "STUDENT")) redirect("/student/dashboard");

  const [docsRes, crfRes] = await Promise.all([
    serverApi<Docs>("/student/registration-documents"),
    serverApi<CrfSlip>("/student/registration/slip"),
  ]);

  const docs = docsRes.data;
  const crf = crfRes.ok ? crfRes.data : null;

  const readiness = [
    { label: "Fees cleared", ok: Boolean(docs?.feesCleared) },
    { label: "Registration submitted", ok: Boolean(docs?.registrationStatus) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Documents"
        title="Registration Forms"
        description="Print your registration documents — availability depends on fee clearance and registration approval."
        icon="printer"
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {readiness.map((r) => (
              <span
                key={r.label}
                className={`badge ${r.ok ? "badge-green" : "badge-amber"}`}
              >
                <Icon name={r.ok ? "check" : "clock"} className="h-3 w-3" strokeWidth={2.4} />
                {r.label}
              </span>
            ))}
          </span>
        }
      />

      {!docsRes.ok && <Alert kind="error">{docsRes.message}</Alert>}

      {docs && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {docs.forms.map((f) => (
            <div key={f.code} className="card-hover flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset ${
                    f.available
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                      : "bg-slate-50 text-ink-400 ring-slate-200"
                  }`}
                >
                  <Icon name={f.available ? "checkCircle" : "lock"} className="h-5 w-5" />
                </span>
                <span className={f.available ? "badge-green" : "badge-gray"}>
                  {f.available ? "Ready" : "Locked"}
                </span>
              </div>
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-brand-600">{f.code}</p>
                <h2 className="mt-0.5 text-[15px] font-bold leading-snug text-ink-900">{f.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  {f.available ? "Ready to print." : `Requires ${f.requires ?? "approval"} first.`}
                </p>
              </div>
              <div className="mt-auto">
                {f.available ? (
                  <PrintButton label={`Print ${f.code}`} />
                ) : (
                  <button className="btn-outline btn-sm w-full" type="button" disabled>
                    Not available yet
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CRF preview — rendered from the Laravel registration slip data */}
      <SectionCard
        title="Course Registration Form (CRF)"
        subtitle="Generated from your approved course registration"
        icon="file"
        padded={false}
        actions={crf?.registration ? <StatusBadge status={crf.registration.status} /> : undefined}
      >
        {!crf ? (
          <div className="p-5">
            <Alert kind="info">{crfRes.message || "No registration found for the current semester."}</Alert>
          </div>
        ) : (
          <div>
            <dl className="grid gap-4 border-b border-[var(--line)] bg-slate-50/50 p-5 text-sm sm:grid-cols-3">
              {[
                ["Student", crf.student.name],
                ["Matric Number", <span key="m" className="font-mono">{crf.student.matricNumber}</span>],
                ["Programme", crf.student.programme ?? "—"],
                ["Level", `Level ${crf.student.level}`],
                ["Semester", crf.semester ?? "—"],
                ["Session", crf.session ?? "—"],
              ].map(([label, value], idx) => (
                <div key={idx}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label as string}</dt>
                  <dd className="mt-1 font-semibold text-ink-900">{value as ReactNode}</dd>
                </div>
              ))}
            </dl>

            <table className="table-base">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Course Title</th>
                  <th className="text-right">Units</th>
                </tr>
              </thead>
              <tbody>
                {crf.registration?.items.map((it) => (
                  <tr key={it.id}>
                    <td className="font-mono text-xs font-semibold text-ink-700">{it.course.code}</td>
                    <td className="text-ink-900">{it.course.title}</td>
                    <td className="text-right tabular-nums">{it.creditUnits}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-4">
              <p className="text-xs text-ink-600">
                Total units: <strong className="text-ink-900">{crf.registration?.totalCreditUnits ?? 0}</strong> · generated{" "}
                {formatDate(crf.generatedAt)}
              </p>
              <PrintButton label="Print CRF" className="btn-primary" />
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
