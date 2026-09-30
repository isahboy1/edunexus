import Link from "next/link";
import { prisma } from "@/lib/db";
import { getInstitutionSettings, getBranding, resolveLogoUrl } from "@/lib/settings";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import HeroCarousel, { HeroSlide } from "@/components/HeroCarousel";
import CountersBand from "@/components/CountersBand";
import { formatDate, programmeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

/* ── Inline line icons (no icon dependency) ─────────────── */
const icon = "h-6 w-6";
const DocIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className={icon} aria-hidden>
    <path d="M7 3h7l4 4v14H7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14 3v4h4M10 12h6M10 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className={icon} aria-hidden>
    <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const CapIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className={icon} aria-hidden>
    <path d="M12 4L2.5 9 12 14l9.5-5L12 4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export default async function HomePage() {
  const [
    inst, branding, news, announcements, programmeCount, studentCount, facultyCount,
    featuredProgrammes, session, faculties, testimonials,
  ] = await Promise.all([
    getInstitutionSettings(),
    getBranding(),
    prisma.news.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 3,
    }),
    prisma.announcement.findMany({
      where: {
        status: "PUBLISHED",
        OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.programme.count({ where: { status: "ACTIVE" } }),
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.faculty.count({ where: { isActive: true } }),
    prisma.programme.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      take: 6,
      include: {
        department: {
          select: { name: true, faculty: { select: { name: true } }, _count: { select: { programmes: true } } },
        },
      },
    }),
    prisma.academicSession.findFirst({ where: { isCurrent: true } }),
    prisma.faculty.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      take: 9,
      include: { _count: { select: { departments: { where: { isActive: true } } } } },
    }),
    prisma.testimonial.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ displayOrder: "asc" }, { publishedAt: "desc" }],
      take: 6,
    }),
  ]);

  const window = session
    ? await prisma.applicationSetting.findUnique({ where: { academicSessionId: session.id } })
    : null;
  const applicationsOpen = window?.isActive ?? false;

  /* ── Hero slides ──────────────────────────────────────── */
  const beforeYouApply = [
    "O'Level results — WAEC, NECO or NABTEB",
    "JAMB UTME registration (UTME track)",
    "Recent passport photograph",
    "Application fee payment (bank or online)",
  ];

  const slides: HeroSlide[] = [
    applicationsOpen
      ? {
          tone: "navy",
          image: "/slides/admissions.svg",
          imageAlt: "Two students in modest Islamic dress walking across campus with application documents",
          eyebrow: `${session?.name ?? "2026/2027"} admissions`,
          title: "Applications are open — start yours today",
          titleHighlight: "start yours today",
          body:
            "One account takes you through the whole journey: complete the form section by section, upload your credentials, pay securely and follow every decision in real time.",
          ctas: [
            { href: "/register", label: "Start your application", variant: "accent" },
            { href: "/admissions", label: "Entry requirements", variant: "ghost" },
          ],
          meta: window ? (
            <>
              Application fee{" "}
              <strong className="font-semibold text-white">
                <span className="mr-[3px]">₦</span>{Number(window.applicationFee).toLocaleString()}
              </strong>
              {window.closesAt && (
                <>
                  {"  ·  "}Deadline <strong className="font-semibold text-white">{formatDate(window.closesAt)}</strong>
                </>
              )}
            </>
          ) : undefined,
          panel: { heading: "Before you apply", items: beforeYouApply },
        }
      : {
          tone: "navy",
          image: "/slides/admissions.svg",
          imageAlt: "Two students in modest Islamic dress walking across campus with application documents",
          eyebrow: session ? `${session.name} admissions` : "Admissions",
          title: "Admission for this session is closed",
          titleHighlight: "closed",
          body:
            "The application window for this session has closed. Review the entry requirements, prepare your documents, and check back when the next window opens.",
          ctas: [
            { href: "/admissions", label: "Entry requirements", variant: "accent" },
            { href: "/login", label: "Check your status", variant: "ghost" },
          ],
          panel: { heading: "Prepare while you wait", items: beforeYouApply },
        },
    {
      tone: "blue",
      image: "/slides/programmes.svg",
      imageAlt: "Students in hijab and kufi studying together with books and a laptop",
      eyebrow: "Academics",
      title: "Programmes that lead to real careers",
      titleHighlight: "real careers",
      body: `Explore our catalogue of undergraduate programmes — entry requirements, duration and pathways included — taught across ${facultyCount} faculties by scholars and practitioners.`,
      ctas: [
        { href: "/programmes", label: "Browse programmes", variant: "accent" },
        { href: "/admissions", label: "How admission works", variant: "ghost" },
      ],
      meta: `${programmeCount} active programmes · ${facultyCount} faculties · Full-time study`,
      panel: {
        heading: "Featured programmes",
        items: featuredProgrammes.length
          ? featuredProgrammes.slice(0, 5).map((p) => programmeLabel(p))
          : ["Programme catalogue coming shortly"],
      },
    },
    {
      tone: "forest",
      image: "/slides/portal.svg",
      imageAlt: "Student in hijab checking the school portal on her phone beside floating interface cards",
      eyebrow: "Student portal",
      title: "Pay fees, register courses, stay on track",
      titleHighlight: "stay on track",
      body:
        "Registered students manage everything online: invoices and receipts, semester course registration with lecturer and HOD approval, downloadable forms and result notifications.",
      ctas: [
        { href: "/student/dashboard", label: "Student login", variant: "accent" },
        { href: "/login", label: "Applicant login", variant: "ghost" },
      ],
      meta: "Works on any device — your records follow you.",
      panel: {
        heading: "In your portal",
        items: [
          "Fees, invoices and payment receipts",
          "Course registration (12–24 credit units)",
          "Registration forms: SIF, CRF, library",
          "Semester results and transcripts",
        ],
      },
    },
  ];

  const stats = [
    { label: "Success Stories", value: studentCount, hint: "Students enrolled" },
    { label: "Trusted Tutors", value: facultyCount, hint: "Active faculties" },
    { label: "Schedules", value: 2, hint: "Semesters per session" },
    { label: "Courses", value: programmeCount, hint: "Active programmes" },
  ];

  const pathways = [
    {
      icon: <DocIcon />,
      title: "Apply for admission",
      body: "Create an account, complete the eight-step form, upload your credentials and pay the application fee — saving your progress as you go.",
      href: "/register",
      cta: "Start application",
    },
    {
      icon: <SearchIcon />,
      title: "Track your application",
      body: "Already applied? Sign in to follow screening progress, respond to correction requests and view your admission decision.",
      href: "/login",
      cta: "Applicant login",
    },
    {
      icon: <CapIcon />,
      title: "Student portal",
      body: "Registered students pay fees, register courses each semester, download forms and slips, and check results — all in one place.",
      href: "/student/dashboard",
      cta: "Student login",
    },
  ];

  return (
    <>
      <SiteHeader instName={inst.name} instShort={inst.shortName} logoUrl={resolveLogoUrl(branding)} />
      <main id="main-content" className="flex-1">
        {/* Hero carousel — full-bleed, Academia style */}
        <HeroCarousel slides={slides} />

        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Benefits — "Benefits About Online Learning Expertise" */}
          <section className="mt-16 md:mt-24">
            <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:gap-14">
              <div>
                <p className="academia-eyebrow">Learn Anything</p>
                <h2 className="academia-h2">Benefits About Online Learning Expertise</h2>
                <p className="mt-5 max-w-md text-sm leading-[1.9] text-ink-600">
                  {inst.name} runs its admissions, records and payments on one connected
                  system — so every step, from first enquiry to final certificate, happens
                  in a single place.
                </p>
                <Link href="/programmes" className="academia-btn mt-8 inline-flex">
                  Explore programmes
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-4 w-4">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {[
                  { t: "Online Courses", d: "Programme pages carry entry requirements, duration and pathways so applicants self-serve." },
                  { t: "Earn A Certificates", d: "Statements of result and final certificates are issued and verifiable through the portal." },
                  { t: "Learn with Expert", d: `Taught across ${facultyCount} faculties by scholars and industry practitioners.` },
                  { t: "Track Everything", d: "Screening progress, fees, course registration and results — visible in real time." },
                ].map((b) => (
                  <div key={b.t} className="academia-card p-7">
                    <span aria-hidden className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#1eb2a6]/10 text-[#188f85]">
                      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                        <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <h3 className="mt-5 text-center text-[17px] font-semibold text-[#1d2a32]">{b.t}</h3>
                    <p className="mt-2.5 text-center text-[13px] leading-[1.8] text-ink-600">{b.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Counters — "3000 Success Stories · 320 Trusted Tutors …" */}
          <CountersBand stats={stats} />

          {/* Pathways — three ways in */}
          <section className="mt-16 md:mt-24">
            <div className="text-center">
              <p className="academia-eyebrow">Get started</p>
              <h2 className="academia-h2">Three ways in</h2>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {pathways.map((c) => (
                <div
                  key={c.title}
                  className="academia-card group flex flex-col p-7 transition-transform duration-200 hover:-translate-y-1"
                >
                  <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1eb2a6]/10 text-[#188f85]">
                    {c.icon}
                  </span>
                  <h3 className="mt-5 text-[17px] font-semibold text-[#1d2a32]">{c.title}</h3>
                  <p className="mt-2.5 flex-1 text-[13px] leading-[1.8] text-ink-600">{c.body}</p>
                  <Link
                    href={c.href}
                    className="mt-6 inline-flex items-center gap-1.5 self-start text-[12px] font-semibold uppercase tracking-[1px] text-[#188f85] transition-colors hover:text-[#1d2a32]"
                  >
                    {c.cta}
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-3.5 w-3.5">
                      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </div>
              ))}
            </div>
          </section>

          {/* Programmes preview — "Explore Our Popular Online Courses" */}
          {featuredProgrammes.length > 0 && (
            <section className="mt-16 md:mt-24">
              <div className="text-center">
                <p className="academia-eyebrow">Courses</p>
                <h2 className="academia-h2">Explore Our Popular Programmes</h2>
              </div>
              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {featuredProgrammes.map((p) => (
                  <Link
                    key={p.id}
                    href="/programmes"
                    className="academia-card group flex flex-col p-6 transition-transform duration-200 hover:-translate-y-1"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-[4px] bg-[#1eb2a6]/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#188f85]">
                        {p.code}
                      </span>
                      {p.award && (
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                          {p.award}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-4 text-[16.5px] font-semibold leading-snug text-[#1d2a32] transition-colors group-hover:text-[#188f85]">
                      {p.name}
                    </h3>
                    <p className="mt-2.5 text-[13px] text-ink-600">
                      {p.department?.faculty?.name ?? p.department?.name ?? "EduNexus"}
                    </p>
                    <p className="mt-1 text-[12px] font-medium text-ink-400">
                      {p.award ?? "Undergraduate"}
                      {p.durationYears ? ` · ${Number(p.durationYears)} year${Number(p.durationYears) > 1 ? "s" : ""}` : ""}
                      {` · Full-time`}
                    </p>
                  </Link>
                ))}
              </div>
              <div className="mt-10 text-center">
                <Link href="/programmes" className="academia-btn inline-flex">
                  Browse all programmes
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-4 w-4">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>
            </section>
          )}

          {/* Category grid — "Browse Our Online Courses" */}
          <section className="mt-16 md:mt-24">
            <div className="text-center">
              <p className="academia-eyebrow">Faculties</p>
              <h2 className="academia-h2">Browse Our Academic Categories</h2>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {faculties.map((f) => (
                <Link
                  key={f.id}
                  href="/programmes"
                  className="group flex items-center justify-between gap-4 bg-white px-6 py-6 transition-colors hover:bg-[#1eb2a6] hover:text-white"
                >
                  <div>
                    <h3 className="text-[14.5px] font-semibold leading-snug">{f.name}</h3>
                    <p className="mt-1 text-[12px] text-ink-400 group-hover:text-white/80">
                      {f._count.departments} department{f._count.departments === 1 ? "" : "s"}
                    </p>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-5 w-5 shrink-0 text-[#1eb2a6] transition group-hover:text-white">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              ))}
            </div>
          </section>

          {/* News — "Recent From Blog" */}
          <section className="mt-16 md:mt-24">
            <div className="text-center">
              <p className="academia-eyebrow">Our Blog</p>
              <h2 className="academia-h2">Recent From Blog</h2>
            </div>

            {news.length === 0 ? (
              <p className="muted mt-8 text-center">No news published yet.</p>
            ) : (
              <div className="mt-10 grid gap-6 md:grid-cols-3">
                {news.map((n) => (
                  <article key={n.id} className="academia-card group overflow-hidden">
                    <div className="h-2 bg-[#1eb2a6]" />
                    <div className="p-6">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-400">
                        <span className="font-medium text-ink-600">{n.authorName ?? "Admin"}</span>
                        <span>{formatDate(n.publishedAt)}</span>
                      </div>
                      <h3 className="mt-3 text-[16px] font-semibold leading-snug text-[#1d2a32] transition-colors group-hover:text-[#188f85]">
                        <Link href="/news">{n.title}</Link>
                      </h3>
                      <p className="mt-2.5 text-[13px] leading-[1.8] text-ink-600 line-clamp-3">
                        {n.excerpt ?? n.content.slice(0, 200)}
                      </p>
                      <Link href="/news" className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[1px] text-[#188f85] transition-colors hover:text-[#1d2a32]">
                        Read more
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-3.5 w-3.5">
                          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Notice board — EduNexus-specific, Academia card styling */}
          {announcements.length > 0 && (
            <section className="mt-16 md:mt-24">
              <div className="text-center">
                <p className="academia-eyebrow">Notice board</p>
                <h2 className="academia-h2">Latest announcements</h2>
              </div>
              <ul className="academia-card mt-10 divide-y divide-line overflow-hidden">
                {announcements.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 px-6 py-4.5 transition hover:bg-[#1eb2a6]/[0.04] sm:flex-row sm:items-baseline sm:gap-6">
                    <time className="w-36 shrink-0 text-xs tabular-nums text-ink-400">
                      {formatDate(a.createdAt)}
                    </time>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">{a.title}</p>
                      <p className="mt-0.5 text-sm text-ink-600">{a.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Testimonials — Academia's "Our Successful Students" */}
          {testimonials.length > 0 && (
            <section className="mt-16 md:mt-24">
              <div className="text-center">
                <p className="academia-eyebrow">Testimonial</p>
                <h2 className="academia-h2">Our Successful Students</h2>
              </div>
              <div className="mt-10 grid gap-6 md:grid-cols-3">
                {testimonials.slice(0, 3).map((t) => (
                  <figure key={t.id} className="academia-card flex flex-col p-7">
                    <svg viewBox="0 0 24 24" aria-hidden fill="currentColor" className="h-7 w-7 text-[#1eb2a6]/35">
                      <path d="M10 7H6a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h2v3l4-4v-6a3 3 0 0 0-2-3zm11 0h-4a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h2v3l4-4v-6a3 3 0 0 0-2-3z" />
                    </svg>
                    <blockquote className="mt-4 flex-1 text-[13.5px] leading-[1.85] text-ink-700">
                      &ldquo;{t.quote}&rdquo;
                    </blockquote>
                    <figcaption className="mt-5 border-t border-line pt-4">
                      <p className="text-sm font-semibold text-[#1d2a32]">{t.studentName}</p>
                      {t.role && <p className="mt-0.5 text-xs text-ink-400">{t.role}</p>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          {/* Closing CTA — Academia's dark intro band */}
          <section className="mt-16 md:mt-24">
            <div className="rounded-md bg-[#188f85] px-7 py-11 text-white sm:px-12 md:py-12">
              <div className="flex flex-col items-start justify-between gap-7 md:flex-row md:items-center">
                <div>
                  <h2 className="max-w-xl text-[1.6rem] font-semibold leading-snug tracking-[-0.01em] sm:text-[1.85rem]">
                    {applicationsOpen
                      ? `${session?.name ?? "2026/2027"} admission is one form away.`
                      : "Your journey with EduNexus starts here."}
                  </h2>
                  <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/80">
                    {applicationsOpen
                      ? "Create your account, complete the form and pay the application fee — you can save and continue any time."
                      : "Review the requirements, prepare your documents and apply the moment the window opens."}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-3">
                  <Link
                    href={applicationsOpen ? "/register" : "/admissions"}
                    className="inline-flex items-center gap-2 rounded-[4px] bg-white px-6 py-4 text-[12px] font-semibold uppercase tracking-[1px] text-[#188f85] transition-colors hover:bg-white/90"
                  >
                    {applicationsOpen ? "Start application" : "View requirements"}
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-[4px] border border-white/45 px-6 py-4 text-[12px] font-semibold uppercase tracking-[1px] text-white transition-colors hover:bg-white/10"
                  >
                    Applicant login
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter instName={inst.name} instShort={inst.shortName} address={inst.address} email={inst.email} phone={inst.phone} logoUrl={resolveLogoUrl(branding)} />
    </>
  );
}
