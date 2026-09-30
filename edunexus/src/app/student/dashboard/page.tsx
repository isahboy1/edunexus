import Link from "next/link";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { StatusBadge, StatCard, PageHeader, SectionCard, Alert, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatDate, formatNaira, formatEnum, programmeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Student Dashboard" };

type Me = {
  matricNumber: string;
  status: string;
  entryType: string;
  admissionDate: string | null;
  level: number;
  programme: { name: string | null; award: string | null; department: string | null; faculty: string | null };
  outstandingBalance: number;
  currentRegistration: { status: string } | null;
};

type Fees = {
  summary: { total: number; paid: number; outstanding: number };
  invoices: { invoiceNumber: string; type: string; total: number; balance: number; status: string }[];
};

export default async function StudentDashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/student/dashboard");
  if (!hasRole(user, "STUDENT")) {
    if (hasRole(user, "APPLICANT")) redirect("/applicant/dashboard");
    if (hasRole(user, "SUPER_ADMIN", "ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER", "ACADEMIC_OFFICER", "BURSARY_OFFICER", "HOD")) {
      redirect("/admin/dashboard");
    }
    redirect("/login");
  }

  const [meRes, feesRes] = await Promise.all([
    serverApi<Me>("/student/me"),
    serverApi<Fees>("/student/fees"),
  ]);
  if (!meRes.ok || !meRes.data) redirect("/applicant/dashboard");

  const me = meRes.data;
  const invoices = feesRes.data?.invoices ?? [];
  const totalDue = feesRes.data?.summary.outstanding ?? me.outstandingBalance ?? 0;
  const paid = feesRes.data?.summary.paid ?? 0;
  const billed = feesRes.data?.summary.total ?? 0;
  const firstName = user.name.split(" ")[0];
  const feeProgress = billed > 0 ? Math.round((paid / billed) * 100) : 0;

  const facts: [string, ReactNode][] = [
    ["Matriculation No.", <span key="m" className="font-mono text-[13px]">{me.matricNumber}</span>],
    ["Programme", me.programme.name ?? "—"],
    ["Department", me.programme.department ?? "—"],
    ["Faculty", me.programme.faculty ?? "—"],
    ["Level", `Level ${me.level}`],
    ["Entry Mode", formatEnum(me.entryType)],
    ["Admitted", me.admissionDate ? formatDate(me.admissionDate) : "—"],
    ["Registration", me.currentRegistration ? formatEnum(me.currentRegistration.status) : "Not registered"],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student Portal"
        title={`Welcome back, ${firstName}`}
        description={me.programme.name ? programmeLabel(me.programme) : "Your academic workspace"}
        icon="cap"
        actions={
          <>
            <Link href="/student/registration" className="btn-outline">
              <Icon name="clipboard" className="h-4 w-4" /> Registration
            </Link>
            <Link href="/student/fees" className="btn-primary">
              <Icon name="wallet" className="h-4 w-4" /> Pay Fees
            </Link>
          </>
        }
      />

      {totalDue > 0 && (
        <Alert kind="warn" title="Outstanding fees on your account">
          You currently owe <strong>{formatNaira(totalDue)}</strong>. Course registration submission is blocked until
          your balance is cleared.
        </Alert>
      )}

      <section aria-label="Academic and financial summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Matriculation number" value={<span className="font-mono text-base sm:text-lg">{me.matricNumber}</span>} icon="cap" tone="brand" hint={me.programme.department ?? "Student record"} />
        <StatCard label="Current level" value={`Level ${me.level}`} icon="layers" tone="slate" hint={formatEnum(me.entryType)} />
        <StatCard
          label="Academic standing"
          value={<StatusBadge status={me.status} />}
          icon="shield"
          tone="accent"
          hint={me.currentRegistration ? `Registration ${formatEnum(me.currentRegistration.status)}` : "No active registration"}
        />
        <StatCard
          label="Outstanding fees"
          value={formatNaira(totalDue)}
          icon="receipt"
          tone={totalDue > 0 ? "rose" : "accent"}
          hint={billed > 0 ? `${formatNaira(paid)} paid of ${formatNaira(billed)}` : "No invoices raised yet"}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title="Academic record" subtitle="Confirmed student record" icon="book">
          <dl className="divide-y divide-slate-100">
            {facts.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <dt className="text-[12px] text-ink-600 sm:text-[13px]">{label}</dt>
                <dd className="min-w-0 break-words text-right text-[12px] font-semibold text-ink-900 sm:text-[13px]">{value}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard
          title="Fees & Invoices"
          subtitle={billed > 0 ? `${formatNaira(billed)} billed this session` : "Bursary assessment"}
          icon="wallet"
          actions={
            <Link href="/student/fees" className="btn-outline btn-sm">
              Details <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {billed > 0 && (
            <div className="mb-5 rounded-md border border-line bg-[#fbfcfa] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-600">Session fee progress</p>
                <p className="text-xs font-semibold text-brand-800">{feeProgress}% paid</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Fees paid" aria-valuetext={`${feeProgress}% paid`} aria-valuenow={feeProgress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-accent-600 transition-[width]" style={{ width: `${feeProgress}%` }} />
              </div>
              <div className="mt-2 flex justify-between gap-2 text-[11px] text-ink-600">
                <span>Paid {formatNaira(paid)}</span><span>Balance {formatNaira(totalDue)}</span>
              </div>
            </div>
          )}
          {invoices.length === 0 ? (
            <EmptyState
              icon="receipt"
              title="No invoices yet"
              description="The Bursary will publish your fee assessment for this session."
            />
          ) : (
            <ul className="space-y-2.5">
              {invoices.map((i) => (
                <li
                  key={i.invoiceNumber}
                  className="flex flex-col gap-3 rounded-md border border-[var(--line)] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="break-all text-[13px] font-semibold text-ink-900">{i.invoiceNumber}</p>
                    <p className="mt-0.5 text-[11px] text-ink-400">{formatEnum(i.type)}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                    <span className="text-sm font-bold text-ink-900">{formatNaira(i.total)}</span>
                    <StatusBadge status={i.status} />
                  </div>                      </li>
                    ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <section aria-label="Student services" className="grid gap-3 md:grid-cols-3">
        {[
          { href: "/student/registration", icon: "clipboard" as const, title: "Course Registration", body: "Register courses each semester — approval flows through your HOD." },
          { href: "/student/forms", icon: "printer" as const, title: "Registration Forms", body: "Print your SIF, CRF, undertaking, library card and exam slip." },
          { href: "/student/fees", icon: "receipt" as const, title: "Payments & Receipts", body: "Fee payments, RRR references and printable receipts." },
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
