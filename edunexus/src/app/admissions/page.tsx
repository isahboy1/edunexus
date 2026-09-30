import Link from "next/link";
import { prisma } from "@/lib/db";
import { getInstitutionSettings, getBranding, resolveLogoUrl } from "@/lib/settings";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { PublicPageIntro } from "@/components/PublicPageIntro";
import { formatDate, formatNaira } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admissions" };

export default async function AdmissionsPage() {
  const [inst, branding, session] = await Promise.all([
    getInstitutionSettings(),
    getBranding(),
    prisma.academicSession.findFirst({ where: { isCurrent: true } }),
  ]);
  const window = session
    ? await prisma.applicationSetting.findUnique({ where: { academicSessionId: session.id } })
    : null;

  const steps = [
    { n: "01", title: "Create an account", body: "Register with your name, email address and phone number." },
    { n: "02", title: "Complete your application", body: "Provide your personal, programme, JAMB and O-Level information." },
    { n: "03", title: "Upload documents", body: "Add a passport photograph, O-Level results and any required credentials." },
    { n: "04", title: "Pay the application fee", body: `Pay the non-refundable fee${window ? ` of ${formatNaira(Number(window.applicationFee))}` : ""} securely online.` },
    { n: "05", title: "Submit and download your slip", body: "Review your details, submit the form and keep your acknowledgement slip." },
    { n: "06", title: "Follow your application", body: "Sign in to follow screening progress and view your admission decision." },
  ];

  const entryRoutes = [
    {
      title: "UTME entry",
      description: "For candidates applying through the Joint Admissions and Matriculation Board.",
      requirements: ["At least five O-Level credits, including English and Mathematics", "A valid JAMB registration and UTME score", "Select the institution in your JAMB choices"],
    },
    {
      title: "Direct entry",
      description: "For candidates with an approved post-secondary qualification.",
      requirements: ["NCE, ND, HND, IJMB or A-Level qualification", "Meet the programme's O-Level requirements", "Entry level depends on qualification and programme"],
    },
    {
      title: "Flexible study",
      description: "Part-time and long-vacation pathways for applicants who need a different schedule.",
      requirements: ["Flexible schedules for working applicants", "Relevant O-Level credits", "Evening or vacation lecture cycles where offered"],
    },
  ];

  return (
    <>
      <SiteHeader instName={inst.name} instShort={inst.shortName} logoUrl={resolveLogoUrl(branding)} />
      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 sm:px-6 lg:px-8">
        <PublicPageIntro
          eyebrow={`${session?.name ?? "Upcoming session"} · Admissions`}
          title="Your next chapter starts here."
          description={`A clear guide to applying to ${inst.shortName}: review the entry routes, prepare your documents and follow each step through the applicant portal.`}
          aside={window ? (
            <div className="w-full rounded-md border border-line bg-white p-4 shadow-[0_2px_10px_-8px_rgba(16,34,55,0.2)] sm:min-w-[220px]">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-600">Application window</span>
                <span className={window.isActive ? "badge-green" : "badge-gray"}>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                  {window.isActive ? "Open" : "Closed"}
                </span>
              </div>
              <p className="mt-3 text-xl font-semibold tracking-tight text-brand-900">{formatNaira(Number(window.applicationFee))}</p>
              <p className="mt-1 text-xs text-ink-600">Application fee</p>
            </div>
          ) : undefined}
        />

        {window && (
          <section aria-label="Application dates" className="mt-5 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
            <div className="bg-white px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Opens</p>
              <p className="mt-1 text-sm font-semibold text-ink-900">{window.opensAt ? formatDate(window.opensAt) : "Now"}</p>
            </div>
            <div className="bg-white px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Closes</p>
              <p className="mt-1 text-sm font-semibold text-ink-900">{window.closesAt ? formatDate(window.closesAt) : "To be announced"}</p>
            </div>
          </section>
        )}

        <section aria-labelledby="application-steps" className="mt-14 md:mt-16">
          <div className="mb-5">
            <p className="academia-eyebrow">The process</p>
            <h2 id="application-steps" className="academia-h2">How to apply</h2>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step) => (
              <li key={step.n} className="academia-card p-6 transition-transform duration-200 hover:-translate-y-1">
                <span aria-hidden className="font-mono text-xs font-semibold tracking-[0.12em] text-[#188f85]">{step.n}</span>
                <h3 className="mt-4 text-[15px] font-semibold text-[#1d2a32]">{step.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="entry-routes" className="mt-14 md:mt-16">
          <div className="mb-5">
            <p className="academia-eyebrow">Find your route</p>
            <h2 id="entry-routes" className="academia-h2">Entry pathways</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {entryRoutes.map((route) => (
              <article key={route.title} className="academia-card p-5 sm:p-6">
                <h3 className="text-base font-semibold text-[#1d2a32]">{route.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-600">{route.description}</p>
                <ul className="mt-5 space-y-3 border-t border-line pt-4">
                  {route.requirements.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-700">
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1eb2a6]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section aria-label="Start your application" className="mt-14 rounded-md bg-[#188f85] px-7 py-10 text-white sm:px-10">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[2px] text-white/75">Ready when you are</p>
              <h2 className="mt-2 text-[1.4rem] font-semibold leading-snug tracking-[-0.01em]">Start an application or continue where you left off.</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/register" className="inline-flex items-center gap-2 rounded-[4px] bg-white px-6 py-4 text-[12px] font-semibold uppercase tracking-[1px] text-[#188f85] transition-colors hover:bg-white/90">Create account &amp; apply</Link>
              <Link href="/login" className="inline-flex items-center gap-2 rounded-[4px] border border-white/45 px-6 py-4 text-[12px] font-semibold uppercase tracking-[1px] text-white transition-colors hover:bg-white/10">Applicant login</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter instName={inst.name} instShort={inst.shortName} address={inst.address} email={inst.email} phone={inst.phone} logoUrl={resolveLogoUrl(branding)} />
    </>
  );
}
