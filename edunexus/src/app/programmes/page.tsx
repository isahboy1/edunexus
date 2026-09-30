import Link from "next/link";
import { prisma } from "@/lib/db";
import { getInstitutionSettings, getBranding, resolveLogoUrl } from "@/lib/settings";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { PublicPageIntro } from "@/components/PublicPageIntro";
import { programmeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Programmes" };

export default async function ProgrammesPage() {
  const [inst, branding, faculties] = await Promise.all([
    getInstitutionSettings(),
    getBranding(),
    prisma.faculty.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        departments: {
          where: { isActive: true },
          orderBy: { name: "asc" },
          include: {
            programmes: { where: { status: "ACTIVE" }, orderBy: { name: "asc" } },
          },
        },
      },
    }),
  ]);
  const programmeCount = faculties.reduce(
    (total, faculty) => total + faculty.departments.reduce((count, department) => count + department.programmes.length, 0),
    0,
  );

  return (
    <>
      <SiteHeader instName={inst.name} instShort={inst.shortName} logoUrl={resolveLogoUrl(branding)} />
      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 sm:px-6 lg:px-8">
        <PublicPageIntro
          eyebrow="Academics · Programme catalogue"
          title="Find the field that moves you."
          description="Explore active programmes by faculty and department. Check the entry route and programme duration, then review the admissions guide before applying."
          aside={(
            <div className="rounded-md border border-line bg-white px-5 py-4 sm:min-w-[150px]">
              <p className="text-2xl font-semibold tracking-tight text-brand-900">{programmeCount}</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.13em] text-ink-400">Active programmes</p>
            </div>
          )}
        />

        {faculties.length === 0 ? (
          <div className="academia-card mt-10 px-6 py-14 text-center">
            <h2 className="text-lg font-semibold text-[#1d2a32]">The programme catalogue is being updated</h2>
            <p className="mt-2 text-sm text-ink-600">Please check back soon or contact the admissions office for guidance.</p>
            <Link href="/contact" className="academia-btn mt-6 inline-flex">Contact admissions</Link>
          </div>
        ) : (
          <div className="mt-10 space-y-12">
            {faculties.map((faculty, index) => (
              <section key={faculty.id} aria-labelledby={`faculty-${faculty.id}`}>
                <div className="flex items-end justify-between gap-4 border-b border-line pb-3">
                  <div>
                    <p className="academia-eyebrow">Faculty {String(index + 1).padStart(2, "0")}</p>
                    <h2 id={`faculty-${faculty.id}`} className="academia-h2 mt-1.5 !text-[1.45rem] sm:!text-[1.7rem]">{faculty.name}</h2>
                  </div>
                  <span className="hidden text-xs text-ink-400 sm:inline">{faculty.departments.length} departments</span>
                </div>
                {faculty.departments.length === 0 ? (
                  <p className="mt-4 text-sm text-ink-600">Department information will be published soon.</p>
                ) : (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {faculty.departments.map((department) => (
                      <article key={department.id} className="academia-card p-5 sm:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-400">Department</p>
                            <h3 className="mt-1 text-[15px] font-semibold text-ink-900">{department.name}</h3>
                          </div>
                          <span className="badge-gray">{department.programmes.length} {department.programmes.length === 1 ? "programme" : "programmes"}</span>
                        </div>
                        {department.programmes.length === 0 ? (
                          <p className="pt-4 text-sm text-ink-600">No active programmes are listed for this department.</p>
                        ) : (
                          <ul className="divide-y divide-line">
                            {department.programmes.map((programme) => (
                              <li key={programme.id} className="flex flex-col gap-2 py-4 first:pt-4 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <p className="font-semibold leading-snug text-ink-900">{programmeLabel(programme)}</p>
                                  <p className="mt-1 text-xs text-ink-600">
                                    <span className="font-mono">{programme.code}</span>
                                    <span aria-hidden> · </span>
                                    {programme.durationYears ? `${String(programme.durationYears)} years` : "Duration varies"}
                                  </p>
                                </div>
                                <span className="badge-blue self-start sm:self-auto">{programme.award ?? "Programme"}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        <div className="academia-counters mt-14 flex flex-col gap-6 rounded-md px-7 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <p className="text-[1.15rem] font-semibold leading-snug text-white">Found a programme that fits? Review the entry requirements before you apply.</p>
          <Link href="/admissions" className="inline-flex shrink-0 items-center gap-2 rounded-[4px] bg-white px-6 py-4 text-[12px] font-semibold uppercase tracking-[1px] text-[#188f85] transition-colors hover:bg-white/90">View admission requirements</Link>
        </div>
      </main>
      <SiteFooter instName={inst.name} instShort={inst.shortName} address={inst.address} email={inst.email} phone={inst.phone} logoUrl={resolveLogoUrl(branding)} />
    </>
  );
}
