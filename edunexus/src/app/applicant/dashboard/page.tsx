import Link from "next/link";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { getInstitutionSettings } from "@/lib/settings";
import { StatusBadge, StatCard, PageHeader, SectionCard, Progress, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatDate, programmeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Applicant Dashboard" };

interface ApplicantProfile {
  first_name?: string | null;
  firstName?: string | null;
  application_number?: string | null;
  applicationNumber?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  state_of_origin?: string | null;
}

interface ApplicantApplication {
  id: string;
  createdAt?: string | null;
  status: string;
  paymentStatus: string;
  applicationNumber?: string | null;
  programme?: { award?: string | null; name?: string | null } | null;
  academicSession?: { name?: string | null } | null;
  submittedAt?: string | null;
  documents?: { documentType: string }[] | null;
  olevelResults?: unknown[] | null;
  payments?: { status: string }[] | null;
  admission?: { status: string; admissionNumber?: string | null } | null;
}

export default async function ApplicantDashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/applicant/dashboard");
  if (!hasRole(user, "APPLICANT")) {
    if (hasRole(user, "SUPER_ADMIN", "ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER", "ACADEMIC_OFFICER", "BURSARY_OFFICER", "HOD")) {
      redirect("/admin/dashboard");
    }
    redirect("/student/dashboard");
  }

  const [appsRes, meRes] = await Promise.all([
    serverApi<ApplicantApplication[]>("/applicant/applications"),
    serverApi<{ applicant?: ApplicantProfile | null }>("/auth/me"),
  ]);
  const applicant = meRes.data?.applicant;
  if (!applicant) redirect("/login");

  const applications = (appsRes.data ?? [])
    .slice()
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  const current =
    applications.find((a) => !["REJECTED", "WITHDRAWN"].includes(a.status)) ?? applications[0];

  const inst = await getInstitutionSettings();
  const firstName = applicant.first_name ?? applicant.firstName ?? user.name.split(" ")[0];
  const appNumber = applicant.application_number ?? applicant.applicationNumber ?? "";

  const steps = current
    ? [
        { label: "Programme selected", done: true, href: `/applicant/application/${current.id}` },
        {
          label: "Personal information",
          done: Boolean(applicant.date_of_birth && applicant.gender && applicant.state_of_origin),
          href: `/applicant/application/${current.id}`,
        },
        {
          label: "O-Level results",
          done:
            (current.olevelResults ?? []).length > 0 ||
            (current.documents ?? []).some((d) => d.documentType === "OLEVEL_RESULT"),
          href: `/applicant/application/${current.id}`,
        },
        {
          label: "Documents uploaded",
          done: ["PASSPORT", "OLEVEL_RESULT"].every((t) =>
            (current.documents ?? []).some((d) => d.documentType === t)
          ),
          href: `/applicant/application/${current.id}`,
        },
        {
          label: "Application fee paid",
          done: (current.payments ?? []).some((p) => p.status === "SUCCESSFUL"),
          href: `/applicant/application/${current.id}?step=payment`,
        },
        { label: "Application submitted", done: Boolean(current.submittedAt), href: `/applicant/dashboard` },
      ]
    : [];
  const doneCount = steps.filter((s) => s.done).length;
  const progressPercent = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;
  const nextStep = steps.find((s) => !s.done);
  const admission = current?.admission;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Applicant Portal"
        title={`Welcome, ${firstName}`}
        description={
          appNumber ? `Applicant number ${appNumber}` : "Start your application to EduNexus College"
        }
        icon="user"
        actions={
          <>
            {["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "SCREENING", "ADMITTED"].includes(current?.status) && (
              <a className="btn-outline" href={`/api/v1/applicant/applications/${current.id}/slip`}>
                <Icon name="download" className="h-4 w-4" /> Acknowledgement Slip
              </a>
            )}
            {current && ["DRAFT", "PAYMENT_PENDING", "PAID"].includes(current.status) && (
              <Link className="btn-primary" href={`/applicant/application/${current.id}`}>
                Continue Application <Icon name="arrowRight" className="h-4 w-4" />
              </Link>
            )}
            {!current && (
              <Link className="btn-primary" href="/applicant/apply">
                Start Application <Icon name="arrowRight" className="h-4 w-4" />
              </Link>
            )}
          </>
        }
      />

      {!current && (
        <div className="card-flush p-8">
          <EmptyState
            icon="file"
            title="You have not started an application yet"
            description="Use Start Application above to complete the online form, upload your credentials and pay the application fee."
          />
        </div>
      )}

      {current && (
        <>
          <section aria-label="Application overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Application Status"
              value={<StatusBadge status={current.status} />}
              icon="file"
              tone="brand"
              hint={`${applications.length} application${applications.length === 1 ? "" : "s"} on file`}
            />
            <StatCard
              label="Payment"
              value={<StatusBadge status={current.paymentStatus} />}
              icon="wallet"
              tone={current.paymentStatus === "SUCCESSFUL" ? "accent" : "amber"}
              hint={current.paymentStatus === "SUCCESSFUL" ? "Fee verified" : "Fee outstanding"}
              href={`/applicant/application/${current.id}?step=payment`}
            />
            <StatCard
              label="Progress"
              value={`${doneCount}/${steps.length}`}
              icon="clipboard"
              tone={doneCount === steps.length ? "accent" : "slate"}
              hint={nextStep ? `Next: ${nextStep.label}` : "All steps complete"}
            />
            <StatCard
              label="Documents"
              value={(current.documents ?? []).length}
              icon="layers"
              tone="slate"
              hint="Uploaded & verified"
            />
          </section>

          {admission?.status === "OFFERED" && (
            <section aria-labelledby="admission-offer-heading" className="surface-dark relative overflow-hidden rounded-md p-5 text-white shadow-sm sm:p-6">
              <div className="relative flex flex-wrap items-center justify-between gap-5">
                <div className="flex items-start gap-4">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/20">
                    <Icon name="sparkles" className="h-6 w-6 text-emerald-300" />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                      Admission offered
                    </p>
                    <h2 id="admission-offer-heading" className="mt-1 text-xl font-semibold">Congratulations, {firstName}!</h2>
                    <p className="mt-1 text-sm text-brand-100/80">
                      Admission No. <span className="font-mono font-semibold text-white">{admission.admissionNumber}</span>
                    </p>
                  </div>
                </div>
                <Link href="/applicant/admission" className="btn-accent">
                  Accept Admission <Icon name="arrowRight" className="h-4 w-4" />
                </Link>
              </div>
            </section>
          )}

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(270px,0.85fr)]">
            <SectionCard className="min-w-0" title="Application summary" subtitle="Your submitted dossier" icon="file">
              <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                {[
                  ["Application No.", <span key="n" className="font-mono text-[13px]">{current.applicationNumber}</span>],
                  ["Programme", programmeLabel(current.programme)],
                  ["Session", current.academicSession?.name],
                  ["Submitted", current.submittedAt ? formatDate(current.submittedAt) : "Not yet submitted"],
                  ["Documents", `${(current.documents ?? []).length} uploaded`],
                  ["Payment", <StatusBadge key="p" status={current.paymentStatus} />],
                ].map(([label, value], idx) => (
                  <div key={idx}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label as string}</dt>
                    <dd className="mt-1 font-semibold text-ink-900">{value as ReactNode}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6 rounded-lg border border-[var(--line)] bg-slate-50/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-ink-900">Application checklist</p>
                  <span className="text-xs font-semibold tabular-nums text-brand-700">
                    {doneCount} of {steps.length} complete
                  </span>
                </div>
                <Progress value={doneCount} max={steps.length} label="Application progress" hint={`${progressPercent}% complete`} />
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {steps.map((s) => (
                    <li key={s.label} className="flex items-center gap-2.5 text-[13px]">
                      <span
                        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${
                          s.done
                            ? "bg-emerald-50 text-emerald-600 ring-emerald-200"
                            : "bg-white text-ink-400 ring-slate-200"
                        }`}
                      >
                        {s.done ? <Icon name="check" className="h-3 w-3" strokeWidth={2.6} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                      </span>
                      <Link href={s.href} className={`rounded-sm underline-offset-4 hover:underline focus-visible:rounded-sm ${s.done ? "text-ink-900" : "text-ink-600"}`}>
                        {s.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {nextStep && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-100 bg-brand-50/70 px-4 py-3">
                  <p className="text-[13px] text-brand-900">
                    Next step: <strong>{nextStep.label}</strong>
                  </p>
                  <Link className="btn-primary btn-sm" href={nextStep.href}>
                    Continue <Icon name="arrowRight" className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </SectionCard>

            <div className="space-y-5">
              <SectionCard title="Notifications" subtitle="Admissions office updates" icon="bell">
                <EmptyState icon="bell" title="Nothing new" description="You'll be notified here when your application moves forward." />
              </SectionCard>
              <SectionCard title="Need help?" subtitle="Admissions support" icon="mail">
                <ul className="space-y-3 text-sm">
                  <li className="flex items-center gap-2.5 text-ink-600">
                    <Icon name="mail" className="h-4 w-4 shrink-0 text-brand-600" />
                    <a className="break-all font-medium text-brand-800 hover:underline" href={`mailto:${inst.email}`}>
                      {inst.email}
                    </a>
                  </li>
                  <li className="flex items-center gap-2.5 text-ink-600">
                    <Icon name="phone" className="h-4 w-4 shrink-0 text-brand-600" />
                    <a className="font-medium text-brand-800 hover:underline" href={`tel:${inst.phone.replace(/\s/g, "")}`}>
                      {inst.phone}
                    </a>
                  </li>
                  <li className="flex items-start gap-2.5 text-ink-600">
                    <Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                    {inst.address}
                  </li>
                </ul>
              </SectionCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
