"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Spinner, StatusBadge, PageHeader, SectionCard, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatDate, programmeLabel } from "@/lib/format";
import { api } from "@/lib/laravel";

interface StatusApp {
  id: string;
  applicationNumber: string;
  status: string;
  paymentStatus: string;
  submittedAt: string | null;
  decisionComments: string | null;
  programme: { name: string; code: string; award: string | null } | null;
  academicSession: { name: string } | null;
  session?: string | null;
  admission: {
    id: string;
    admissionNumber: string;
    status: string;
    offeredAt: string;
    acceptedAt: string | null;
    offerConditions: string | null;
  } | null;
}

export default function AdmissionStatusPage() {
  const router = useRouter();
  const [apps, setApps] = useState<StatusApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      // Laravel returns the list directly at `data` (already camelCased).
      const res = await api<StatusApp[]>("/applicant/admission-status");
      if (res.ok && res.data) setApps(res.data);
      else setError(res.message || "Failed to load admission status");
    })();
  }, []);

  async function accept(admissionId: string) {
    setBusy(true);
    setError(null);
    // Laravel: POST /applicant/admissions/{id}/accept → { admission, student }.
    const res = await api<{ student: { matricNumber?: string; matric_number?: string } }>(
      `/applicant/admissions/${admissionId}/accept`,
      { method: "POST" }
    );
    if (!res.ok) {
      setError(res.message || "Could not accept admission");
      setBusy(false);
      return;
    }
    const matric = res.data?.student?.matricNumber ?? res.data?.student?.matric_number ?? "(see dashboard)";
    alert(`Congratulations! Your matriculation number is ${matric}`);
    router.push("/student/dashboard");
  }

  if (apps === null) {
    return (
      <div className="mx-auto max-w-3xl">
        {error ? <Alert kind="error">{error}</Alert> : <Spinner label="Loading admission status…" />}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader
        eyebrow="Admissions"
        title="Admission Status"
        description="Track your applications and respond to any offer of admission."
        icon="cap"
      />
      {error && <Alert kind="error">{error}</Alert>}

      <div className="space-y-5">
        {apps.length === 0 && (
          <SectionCard padded={false}>
            <EmptyState
              icon="file"
              title="No applications yet"
              description="Start an application to see its admission status here."
              action={
                <Link className="btn-primary" href="/applicant/apply">
                  Start Application <Icon name="arrowRight" className="h-4 w-4" />
                </Link>
              }
            />
          </SectionCard>
        )}
        {apps.map((a) => (
          <div key={a.id} className="card-flush p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold text-ink-900">{a.applicationNumber}</p>
                <p className="muted text-sm">
                  {programmeLabel(a.programme)} • {a.academicSession?.name ?? a.session ?? ""}
                </p>
              </div>
              <StatusBadge status={a.status} />
            </div>

            {a.decisionComments && (
              <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
                <strong>Note from admissions:</strong> {a.decisionComments}
              </p>
            )}

            {a.admission ? (
              <div
                className={`mt-4 rounded-lg border p-4 ${
                  a.admission.status === "ACCEPTED"
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-brand-100 bg-brand-50/70"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 ring-1 ring-inset ring-emerald-200">
                      <Icon name={a.admission.status === "ACCEPTED" ? "checkCircle" : "sparkles"} className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                        {a.admission.status === "ACCEPTED" ? "Admission accepted" : "Admission offered"}
                      </p>
                      <p className="mt-0.5 font-mono text-sm font-bold text-ink-900">
                        {a.admission.admissionNumber}
                      </p>
                    </div>
                  </div>
                  <span className="badge-green">
                    <Icon name="check" className="h-3 w-3" strokeWidth={2.6} /> {a.admission.status}
                  </span>
                </div>

                <dl className="mt-3 grid gap-2 text-xs text-ink-600 sm:grid-cols-2">
                  <div className="flex gap-1.5">
                    <dt className="font-medium">Offered:</dt>
                    <dd className="font-semibold text-ink-900">{formatDate(a.admission.offeredAt)}</dd>
                  </div>
                  {a.admission.offerConditions && (
                    <div className="flex gap-1.5">
                      <dt className="font-medium">Conditions:</dt>
                      <dd className="font-semibold text-ink-900">{a.admission.offerConditions}</dd>
                    </div>
                  )}
                </dl>

                {a.admission.status === "OFFERED" ? (
                  <button className="btn-primary mt-4" onClick={() => accept(a.admission!.id)} disabled={busy}>
                    {busy ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                        Accepting…
                      </>
                    ) : (
                      <>
                        Accept Admission <Icon name="arrowRight" className="h-4 w-4" />
                      </>
                    )}
                  </button>
                ) : (
                  <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <Icon name="checkCircle" className="h-4 w-4" />
                    {a.admission.status === "ACCEPTED"
                      ? "You have accepted this admission — your student record is active."
                      : a.admission.status}
                  </p>
                )}
              </div>
            ) : (
              ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "SCREENING"].includes(a.status) && (
                <p className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm text-ink-600">
                  <Icon name="clock" className="h-4 w-4 shrink-0 text-amber-500" />
                  Your application is under admission processing — check back later.
                </p>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
