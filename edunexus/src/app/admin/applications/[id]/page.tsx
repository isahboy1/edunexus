import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { StatusBadge, Avatar, Alert } from "@/components/ui";
import { Icon } from "@/components/icons";
import { DocumentViewer } from "@/components/DocumentViewer";
import { ApplicationTimeline } from "@/components/ApplicationTimeline";
import { formatDateTime, formatEnum, programmeLabel, formatNaira } from "@/lib/format";
import { ReviewActions } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review Application — Admin" };

type Dossier = Record<string, any>;

function Fact({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-1 text-[13px] font-semibold text-ink-900">{children}</dd>
    </div>
  );
}

export default async function ReviewApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/admin/applications/${id}`);
  if (!hasRole(user, "SUPER_ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER")) redirect("/admin/dashboard");

  // Laravel returns the full dossier (applicant, programme, jamb, olevel,
  // qualifications, documents, payments, admission) at `data`, camelCased.
  const res = await serverApi<Dossier>(`/admin/applications/${id}`);
  if (res.status === 404) notFound();
  if (!res.ok || !res.data) redirect("/admin/applications");
  const a = res.data;

  // Per-section readiness (same engine as the applicant wizard's hints).
  const comp = await serverApi<{ ready: boolean; sections: { key: string; label: string; complete: boolean; missing: string[] }[]; problems: string[] }>(
    `/admin/applications/${id}/completeness`
  );

  const fullName = [a.applicant?.surname, a.applicant?.firstName, a.applicant?.middleName]
    .filter(Boolean)
    .join(" ");
  const documents: any[] = a.documents ?? [];
  const payments: any[] = a.payments ?? [];
  const olevel: any[] = a.olevelResults ?? [];
  const qualifications: any[] = a.qualifications ?? [];
  const verifiedDocs = documents.filter((d) => d.verificationStatus === "VERIFIED").length;

  const pipelineStages = ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "SCREENING", "ADMITTED"];
  const stageIndex = pipelineStages.indexOf(a.status);
  const rejected = a.status === "REJECTED";

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <Link
            href="/admin/applications"
            className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-ink-600 shadow-sm transition hover:border-brand-500 hover:text-brand-700"
            aria-label="Back to queue"
          >
            <Icon name="chevronRight" className="h-4 w-4 rotate-180" />
          </Link>
          <div className="flex items-center gap-3.5">
            <Avatar name={fullName} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-extrabold tracking-tight text-brand-950">{fullName}</h1>
                <StatusBadge status={a.status} />
              </div>
              <p className="mt-0.5 text-[13px] text-ink-600">
                <span className="font-mono">{a.applicationNumber}</span> ·{" "}
                {programmeLabel(a.programme)} · {a.academicSession?.name}
              </p>
            </div>
          </div>
        </div>
        <a className="btn-outline" href={`/api/v1/applicant/applications/${a.id}/slip`}>
          <Icon name="download" className="h-4 w-4" /> Acknowledgement slip
        </a>
      </div>

      {/* ── Pipeline strip ─────────────────────────────────── */}
      <div className="card-flush px-5 py-4">
        {rejected ? (
          <p className="flex items-center gap-2 text-[13px] font-semibold text-red-700">
            <Icon name="alert" className="h-4 w-4" /> This application was rejected
            {a.decidedAt ? ` — ${formatDateTime(a.decidedAt)}` : ""}.
          </p>
        ) : (
          <ol className="flex flex-wrap items-center gap-y-3">
            {pipelineStages.map((s, i) => {
              const done = stageIndex >= i && stageIndex !== -1;
              const current = stageIndex === i;
              return (
                <li key={s} className="flex items-center">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${
                      current
                        ? "bg-brand-700 text-white shadow-sm"
                        : done
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                          : "bg-slate-50 text-ink-400 ring-1 ring-inset ring-slate-200"
                    }`}
                  >
                    {done && !current && <Icon name="check" className="h-3 w-3" strokeWidth={2.6} />}
                    {formatEnum(s)}
                  </span>
                  {i < pipelineStages.length - 1 && (
                    <span aria-hidden className={`mx-2 h-0.5 w-6 rounded-full ${done ? "bg-emerald-300" : "bg-slate-200"}`} />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {!res.ok && <Alert kind="error">{res.message}</Alert>}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── Main dossier column ──────────────────────────── */}
        <div className="space-y-5 lg:col-span-2">
          {/* Personal */}
          <section className="card-flush overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-brand-700 ring-1 ring-inset ring-slate-200/70">
                <Icon name="user" className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-[15px] font-bold leading-tight text-ink-900">Personal information</h2>
                <p className="text-xs text-ink-600">As entered by the applicant</p>
              </div>
            </div>
            <dl className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
              <Fact label="Date of birth">
                {a.applicant?.dateOfBirth ? new Date(a.applicant.dateOfBirth).toLocaleDateString("en-GB") : "—"}
              </Fact>
              <Fact label="Gender">{formatEnum(a.applicant?.gender)}</Fact>
              <Fact label="Marital status">{formatEnum(a.maritalStatus)}</Fact>
              <Fact label="Religion">{formatEnum(a.religion)}</Fact>
              <Fact label="State / LGA">
                {a.applicant?.stateOfOrigin ?? "—"} / {a.applicant?.lga ?? "—"}
              </Fact>
              <Fact label="Nationality">{a.applicant?.nationality ?? "—"}</Fact>
              <Fact label="Phone">{a.applicant?.user?.phone ?? a.applicant?.phone ?? "—"}</Fact>
              <Fact label="Email">{a.applicant?.user?.email ?? "—"}</Fact>
              <Fact label="Contact address" wide>{a.applicant?.address ?? "—"}</Fact>
              <Fact label="Permanent address" wide>{a.permanentAddress ?? "—"}</Fact>
              <Fact label="Emergency contact" wide>
                {a.emergencyContactName ?? "—"}
                {a.emergencyContactPhone ? ` · ${a.emergencyContactPhone}` : ""}
              </Fact>
            </dl>
          </section>

          {/* Programme */}
          <section className="card-flush overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-brand-700 ring-1 ring-inset ring-slate-200/70">
                <Icon name="cap" className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-[15px] font-bold leading-tight text-ink-900">Programme choice</h2>
                <p className="text-xs text-ink-600">
                  {a.programme?.department?.faculty?.name ?? a.programme?.department?.name ?? "Faculty record"}
                </p>
              </div>
            </div>
            <dl className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-4">
              <Fact label="Programme">{programmeLabel(a.programme)}</Fact>
              <Fact label="Type">{formatEnum(a.applicationType)}</Fact>
              <Fact label="Study mode">{formatEnum(a.studyMode)}</Fact>
              <Fact label="Entry level">{a.entryLevelValue ?? 100}</Fact>
            </dl>
          </section>

          {/* Credentials */}
          <section className="card-flush overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-brand-700 ring-1 ring-inset ring-slate-200/70">
                <Icon name="book" className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-[15px] font-bold leading-tight text-ink-900">Academic credentials</h2>
                <p className="text-xs text-ink-600">
                  {[olevel.length, `O-Level sitting${olevel.length === 1 ? "" : "s"}`].join(" ")}
                  {a.jambResult ? " · JAMB" : ""}{qualifications.length ? ` · ${qualifications.length} prior qualification${qualifications.length === 1 ? "" : "s"}` : ""}
                </p>
              </div>
            </div>
            <div className="space-y-4 p-5">
              {a.jambResult && (
                <div className="rounded-lg border border-[var(--line)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-bold text-ink-900">
                      JAMB · <span className="font-mono">{a.jambResult.registrationNumber}</span>
                    </p>
                    <span className="chip">
                      Score <strong className="ml-1">{a.jambResult.utmeScore ?? "—"}</strong>
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-600">
                    {a.jambResult.examinationYear} · choice: {a.jambResult.institutionChoice ?? "—"}
                  </p>
                  {a.jambResult.subjects?.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      {a.jambResult.subjects.map((s: any, i: number) => (
                        <span key={i} className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-center text-[11px] ring-1 ring-inset ring-brand-100">
                          <span className="block text-ink-600">{s.subject}</span>
                          <strong className="text-brand-900">{s.score}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {olevel.map((r: any) => (
                <div key={r.id} className="rounded-lg border border-[var(--line)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-bold text-ink-900">
                      {r.examinationType} · <span className="font-mono">{r.examinationNumber}</span>
                    </p>
                    <span className="chip">{r.examinationYear} · sitting {r.sittingNumber}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {r.subjects.map((s: any, i: number) => (
                      <span key={i} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-center text-[11px] ring-1 ring-inset ring-slate-200/70">
                        <span className="block text-ink-600">{s.subject}</span>
                        <strong className="text-ink-900">{s.grade}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              {qualifications.map((q: any) => (
                <div key={q.id} className="rounded-lg border border-[var(--line)] p-4">
                  <p className="text-[13px] font-bold text-ink-900">
                    {formatEnum(q.qualification)} — {q.institution} ({q.year})
                  </p>
                  <p className="mt-1 text-xs text-ink-600">
                    {[q.certificate, q.gradeClass].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
              ))}

              {!a.jambResult && olevel.length === 0 && qualifications.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-ink-600">
                  No academic records were provided on this dossier.
                </p>
              )}
            </div>
          </section>

          {/* Documents */}
          <section className="card-flush overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-brand-700 ring-1 ring-inset ring-slate-200/70">
                <Icon name="layers" className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-[15px] font-bold leading-tight text-ink-900">Credentials &amp; documents</h2>
                <p className="text-xs text-ink-600">
                  {documents.length} uploaded · {verifiedDocs} verified · click to preview
                </p>
              </div>
            </div>
            <div className="p-5">
              <DocumentViewer applicationId={a.id} documents={documents} applicantName={fullName} />
            </div>
          </section>

          {/* Payments */}
          <section className="card-flush overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-brand-700 ring-1 ring-inset ring-slate-200/70">
                <Icon name="wallet" className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-[15px] font-bold leading-tight text-ink-900">Payments</h2>
                <p className="text-xs text-ink-600">Application fee transactions</p>
              </div>
            </div>
            {payments.length === 0 ? (
              <div className="p-5">
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-ink-600">
                  No payments recorded.
                </p>
              </div>
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Reference</th><th>RRR</th><th className="text-right">Amount</th><th>Status</th><th>Paid on</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p: any) => (
                    <tr key={p.id}>
                      <td className="font-mono text-xs text-ink-700">{p.reference}</td>
                      <td className="font-mono text-xs text-ink-600">{p.rrr ?? "—"}</td>
                      <td className="text-right font-semibold">{formatNaira(p.amount)}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td className="text-xs text-ink-600">{p.paidAt ? formatDateTime(p.paidAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* ── Right rail: decision + timeline ─────────────── */}
        <div className="space-y-5">
          <ReviewActions applicationId={a.id} status={a.status} hasAdmission={Boolean(a.admission)} />

          {comp.ok && comp.data && (
            <section className="card-flush overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-brand-700 ring-1 ring-inset ring-slate-200/70">
                    <Icon name="clipboard" className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <h2 className="text-[15px] font-bold leading-tight text-ink-900">Submission readiness</h2>
                    <p className="text-xs text-ink-600">What the applicant still owes (same gate as submit)</p>
                  </div>
                </div>
                <span className={comp.data.ready ? "badge-green" : "badge-amber"}>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                  {comp.data.ready ? "Complete" : "Incomplete"}
                </span>
              </div>
              <ul className="divide-y divide-[var(--line)]">
                {comp.data.sections.map((s) => (
                  <li key={s.key} className="flex items-start gap-3 px-5 py-2.5">
                    <span
                      className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        s.complete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                      aria-hidden
                    >
                      {s.complete ? <Icon name="check" className="h-3 w-3" strokeWidth={2.6} /> : <Icon name="alert" className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-[13px] font-semibold ${s.complete ? "text-ink-900" : "text-ink-700"}`}>{s.label}</p>
                      {!s.complete && s.missing.length > 0 && (
                        <p className="mt-0.5 text-[11.5px] leading-snug text-amber-800">Missing: {s.missing.join(", ")}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {a.admission && (
            <div className="card-flush overflow-hidden border-l-4 border-l-emerald-500">
              <div className="border-b border-[var(--line)] px-5 py-3.5">
                <h2 className="text-[15px] font-bold text-ink-900">Admission offer</h2>
              </div>
              <div className="space-y-2 p-5 text-[13px]">
                <p className="font-mono text-sm font-bold text-emerald-700">{a.admission.admissionNumber}</p>
                <p className="text-ink-600">Status: <strong className="text-ink-900">{formatEnum(a.admission.status)}</strong></p>
                <p className="text-ink-600">Offered: {formatDateTime(a.admission.offeredAt)}</p>
                {a.admission.offerConditions && (
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    <strong>Conditions: </strong>{a.admission.offerConditions}
                  </p>
                )}
              </div>
            </div>
          )}

          <section className="card-flush overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-brand-700 ring-1 ring-inset ring-slate-200/70">
                <Icon name="clock" className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-[15px] font-bold leading-tight text-ink-900">Timeline</h2>
                <p className="text-xs text-ink-600">Lifecycle of this application</p>
              </div>
            </div>
            <div className="p-5">
              <ApplicationTimeline
                status={a.status}
                createdAt={a.createdAt ?? null}
                submittedAt={a.submittedAt ?? null}
                reviewedAt={a.reviewedAt ?? null}
                decidedAt={a.decidedAt ?? null}
                statusUpdatedAt={a.updatedAt ?? null}
                reviewComments={a.reviewComments ?? null}
                decisionComments={a.decisionComments ?? null}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
