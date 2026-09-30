import Link from "next/link";
import { prisma } from "@/lib/db";
import { getInstitutionSettings, getBranding, resolveLogoUrl } from "@/lib/settings";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { PublicPageIntro } from "@/components/PublicPageIntro";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "News" };

export default async function NewsPage() {
  const [inst, branding, news] = await Promise.all([
    getInstitutionSettings(),
    getBranding(),
    prisma.news.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <>
      <SiteHeader instName={inst.name} instShort={inst.shortName} logoUrl={resolveLogoUrl(branding)} />
      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 sm:px-6 lg:px-8">
        <PublicPageIntro
          eyebrow="Campus life · Newsroom"
          title="The latest from campus."
          description="Announcements, milestones and stories from the EduNexus community."
          aside={<span className="text-sm text-ink-600">{news.length} {news.length === 1 ? "story" : "stories"}</span>}
        />
        {news.length === 0 ? (
          <div className="mt-10 rounded-md border border-dashed border-line-strong bg-white px-6 py-14 text-center">
            <p className="text-base font-semibold text-brand-900">No news published yet</p>
            <p className="mt-2 text-sm text-ink-600">Check back soon for updates from the campus community.</p>
            <Link href="/" className="btn-outline mt-5">Return to home</Link>
          </div>
        ) : (
          <section aria-label="Published campus news" className="mt-9 grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {news.map((item, index) => (
              <article key={item.id} className={`academia-card group flex min-w-0 flex-col overflow-hidden transition-transform duration-200 hover:-translate-y-1 ${index === 0 ? "sm:col-span-2 sm:grid sm:grid-cols-2 lg:col-span-2" : ""}`}>
                <div aria-hidden className="h-1.5 bg-[#1eb2a6]" />
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={`Illustration for ${item.title}`} loading="lazy" className={`h-48 w-full object-cover ${index === 0 ? "sm:h-full sm:min-h-[250px]" : ""}`} />
                ) : (
                  <div aria-hidden className={`flex h-32 items-end bg-[#18374b] px-5 pb-4 ${index === 0 ? "sm:h-full sm:min-h-[250px]" : ""}`}>
                    <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#c5d9ce]">EduNexus · Campus news</span>
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col p-5 pt-4 sm:p-6 sm:pt-5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-400">
                    <time dateTime={item.publishedAt ? new Date(item.publishedAt).toISOString() : undefined}>{formatDate(item.publishedAt)}</time>
                    {item.authorName && <><span aria-hidden>·</span><span>{item.authorName}</span></>}
                  </div>
                  <h2 className={`${index === 0 ? "mt-3 text-xl sm:text-2xl" : "mt-2 text-base"} font-semibold leading-snug tracking-tight text-[#1d2a32] transition-colors group-hover:text-[#188f85]`}>
                    {item.title}
                  </h2>
                  <p className="mt-3 flex-1 text-[13px] leading-[1.8] text-ink-600">{item.excerpt ?? item.content.slice(0, 180)}</p>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
      <SiteFooter instName={inst.name} instShort={inst.shortName} address={inst.address} email={inst.email} phone={inst.phone} logoUrl={resolveLogoUrl(branding)} />
    </>
  );
}
