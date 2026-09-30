import { getInstitutionSettings, getBranding, resolveLogoUrl } from "@/lib/settings";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { PublicPageIntro } from "@/components/PublicPageIntro";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contact Us" };

export default async function ContactPage() {
  const [inst, branding] = await Promise.all([
    getInstitutionSettings(),
    getBranding(),
  ]);
  return (
    <>
      <SiteHeader instName={inst.name} instShort={inst.shortName} logoUrl={resolveLogoUrl(branding)} />
      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 sm:px-6 lg:px-8">
        <PublicPageIntro
          eyebrow="We’re here to help"
          title="Talk to the right people."
          description="Reach the institution for admissions guidance, programme questions or general enquiries."
        />

        <div className="mt-9 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section aria-labelledby="contact-details" className="academia-card min-w-0 p-5 sm:p-7">
            <p className="academia-eyebrow">Institution details</p>
            <h2 id="contact-details" className="academia-h2 mt-2 !text-[1.5rem] sm:!text-[1.7rem]">Reach the campus</h2>
            <dl className="mt-6 divide-y divide-line">
              <div className="grid gap-2 py-4 first:pt-0 sm:grid-cols-[130px_1fr] sm:gap-5">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Address</dt>
                <dd className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-700"><Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-[#188f85]" />{inst.address}</dd>
              </div>
              <div className="grid gap-2 py-4 sm:grid-cols-[130px_1fr] sm:gap-5">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Email</dt>
                <dd className="flex items-start gap-2.5 text-sm text-ink-700"><Icon name="mail" className="mt-0.5 h-4 w-4 shrink-0 text-[#188f85]" /><a className="break-all font-medium text-[#188f85] underline-offset-4 hover:underline" href={`mailto:${inst.email}`}>{inst.email}</a></dd>
              </div>
              <div className="grid gap-2 py-4 sm:grid-cols-[130px_1fr] sm:gap-5">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Phone</dt>
                <dd className="flex items-start gap-2.5 text-sm text-ink-700"><Icon name="phone" className="mt-0.5 h-4 w-4 shrink-0 text-[#188f85]" /><a className="font-medium text-[#188f85] underline-offset-4 hover:underline" href={`tel:${inst.phone.replace(/\s/g, "")}`}>{inst.phone}</a></dd>
              </div>
              <div className="grid gap-2 py-4 last:pb-0 sm:grid-cols-[130px_1fr] sm:gap-5">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Website</dt>
                <dd className="break-all text-sm text-ink-700">{inst.domain}</dd>
              </div>
            </dl>
          </section>

          <aside className="flex min-w-0 flex-col rounded-md bg-[#188f85] p-6 text-white sm:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[2px] text-white/75">Admissions office</p>
            <h2 className="mt-2 text-[1.5rem] font-semibold leading-snug tracking-[-0.01em]">Planning to apply?</h2>
            <p className="mt-3 text-sm leading-relaxed text-brand-100/80">For questions about programmes, entry requirements or an existing application, contact the admissions office during working hours.</p>
            <div className="mt-5 space-y-3 border-t border-white/15 pt-5 text-sm text-white/90">
              <p className="flex items-center gap-2.5"><Icon name="clock" className="h-4 w-4 text-white/70" /> Monday – Friday, 8:00 AM – 4:00 PM</p>
              <p className="flex items-start gap-2.5"><Icon name="mail" className="mt-0.5 h-4 w-4 shrink-0 text-white/70" /><a className="break-all underline-offset-4 hover:underline" href={`mailto:${inst.email}`}>{inst.email}</a></p>
            </div>
            <div className="mt-auto flex flex-wrap gap-3 pt-7 [&>*]:min-h-11">
              <a href={`mailto:${inst.email}`} className="inline-flex items-center rounded-[4px] bg-white px-6 py-3.5 text-[12px] font-semibold uppercase tracking-[1px] text-[#188f85] transition-colors hover:bg-white/90">Email admissions</a>
              <a href={`tel:${inst.phone.replace(/\s/g, "")}`} className="inline-flex items-center rounded-[4px] border border-white/45 px-6 py-3.5 text-[12px] font-semibold uppercase tracking-[1px] text-white transition-colors hover:bg-white/10">Call the office</a>
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter instName={inst.name} instShort={inst.shortName} address={inst.address} email={inst.email} phone={inst.phone} logoUrl={resolveLogoUrl(branding)} />
    </>
  );
}
