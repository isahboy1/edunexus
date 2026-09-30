import { notFound, redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { formatEnum, programmeLabel } from "@/lib/format";
import { PrintButton, AutoPrint } from "./print-controls";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Application Form",
  // Nothing to index; this is a printable document view.
  robots: { index: false, follow: false },
};

type Dossier = Record<string, any>;

function Row({ label, value, wide }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return (
    <div className={wide ? "print-row-wide" : "print-row"}>
      <span className="print-label">{label}</span>
      <span className="print-value">{value || "—"}</span>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="print-heading">{children}</h2>;
}

/**
 * /print/application/[id] — official application form for printing / PDF
 * export. Deliberately OUTSIDE the portal shell (top-level route, root
 * layout only): no sidebar, header or buttons — @media print strips the
 * toolbar so the paper output is the form alone. `?autoprint=1` opens the
 * browser print dialog on load. Officers can print applicant forms too.
 */
export default async function ApplicationPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const { autoprint } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/print/application/${id}`);
  // Officers print applicant forms too.
  if (!hasRole(user, "APPLICANT", "STUDENT", "SUPER_ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER")) redirect("/");

  const res = await serverApi<Dossier>(`/applicant/applications/${id}`);
  if (res.status === 404) notFound();
  if (!res.ok || !res.data) redirect(`/applicant/application/${id}`);

  const a = res.data;
  const ap = a.applicant ?? {};
  const olevel: any[] = a.olevelResults ?? [];
  const jamb = a.jambResult ?? null;
  const quals: any[] = a.qualifications ?? [];
  const payments: any[] = a.payments ?? [];
  const docs: any[] = a.documents ?? [];
  const paid = payments.some((p) => p.status === "SUCCESSFUL");
  const dob = ap.dateOfBirth ? new Date(ap.dateOfBirth).toLocaleDateString("en-GB") : null;

  return (
    <div className="print-root">
      <PrintToolbar autoprint={autoprint === "1"} id={id} />

      <article className="print-sheet" aria-label={`Application form ${a.applicationNumber}`}>
        {/* Letterhead */}
        <header className="print-letterhead">
          <h1>Adamu Kankon College of Islamic and Legal Studies</h1>
          <p className="print-sub">Application for Admission — {a.academicSession?.name ?? "—"}</p>
        </header>

        <div className="print-meta">
          <Row label="Application No." value={a.applicationNumber} />
          <Row label="Submitted" value={a.submittedAt ? new Date(a.submittedAt).toLocaleDateString("en-GB") : "Not submitted"} />
          <Row label="Status" value={formatEnum(a.status)} />
        </div>

        {/* A — Bio data */}
        <section>
          <Heading>A — Bio Data</Heading>
          <div className="print-grid">
            <Row label="Surname" value={ap.surname} />
            <Row label="First name" value={ap.firstName} />
            <Row label="Other names" value={ap.middleName} />
            <Row label="Date of birth" value={dob} />
            <Row label="Gender" value={formatEnum(ap.gender)} />
            <Row label="Marital status" value={formatEnum(a.maritalStatus)} />
            <Row label="Religion" value={formatEnum(a.religion)} />
            <Row label="Nationality" value={ap.nationality} />
            <Row label="State of origin" value={ap.stateOfOrigin} />
            <Row label="LGA" value={ap.lga} />
            <Row label="Phone" value={ap.user?.phone ?? ap.phone} />
            <Row label="Email" value={ap.user?.email} />
            <Row label="Residential address" value={ap.address} wide />
          </div>
        </section>

        {/* B — Contact */}
        <section>
          <Heading>B — Contact Information</Heading>
          <div className="print-grid">
            <Row label="Permanent address" value={a.permanentAddress} wide />
            <Row label="Current address" value={a.currentAddress} wide />
            <Row label="Emergency contact" value={[a.emergencyContactName, a.emergencyContactPhone].filter(Boolean).join(" · ")} wide />
          </div>
        </section>

        {/* C — Programme */}
        <section>
          <Heading>C — Programme Choice</Heading>
          <div className="print-grid">
            <Row label="Programme" value={programmeLabel(a.programme)} />
            <Row label="Application type" value={formatEnum(a.applicationType)} />
            <Row label="Study mode" value={formatEnum(a.studyMode)} />
            <Row label="Entry level" value={a.entryLevelValue ? String(a.entryLevelValue) : null} />
          </div>
        </section>

        {/* D — O'Level sittings */}
        <section>
          <Heading>D — O&apos;Level Results</Heading>
          {olevel.length === 0 && <p className="print-empty">No O&apos;Level results provided.</p>}
          {olevel.map((r) => (
            <div key={r.id} className="print-block">
              <p className="print-block-title">
                {formatEnum(r.examinationType)} · {r.examinationNumber} · {r.examinationYear} ·{" "}
                {r.sittingNumber === 2 ? "Second sitting" : "First sitting"}
              </p>
              <table className="print-table">
                <thead>
                  <tr><th>Subject</th><th>Grade</th></tr>
                </thead>
                <tbody>
                  {(r.subjects ?? []).map((s: any, i: number) => (
                    <tr key={i}><td>{s.subject}</td><td>{s.grade}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        {/* E — JAMB (UTME) */}
        {jamb && (
          <section>
            <Heading>E — JAMB Details</Heading>
            <div className="print-grid">
              <Row label="Registration no." value={jamb.registrationNumber} />
              <Row label="Examination year" value={jamb.examinationYear ? String(jamb.examinationYear) : null} />
              <Row label="UTME score" value={jamb.utmeScore != null ? String(jamb.utmeScore) : null} />
              <Row label="Institution choice" value={jamb.institutionChoice} />
            </div>
            {(jamb.subjects ?? []).length > 0 && (
              <table className="print-table">
                <thead><tr><th>Subject</th><th>Score</th></tr></thead>
                <tbody>
                  {jamb.subjects.map((s: any, i: number) => (
                    <tr key={i}><td>{s.subject}</td><td>{s.score}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* F — Previous qualifications (Direct Entry) */}
        {quals.length > 0 && (
          <section>
            <Heading>F — Previous Qualifications</Heading>
            <table className="print-table">
              <thead><tr><th>Qualification</th><th>Institution</th><th>Year</th><th>Grade / class</th></tr></thead>
              <tbody>
                {quals.map((q) => (
                  <tr key={q.id}>
                    <td>{formatEnum(q.qualification)}</td><td>{q.institution}</td><td>{q.year}</td><td>{q.gradeClass ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* G — Payment */}
        <section>
          <Heading>G — Application Fee</Heading>
          {payments.length === 0 ? (
            <p className="print-empty">No payment recorded.</p>
          ) : (
            <table className="print-table">
              <thead><tr><th>Reference</th><th>Amount</th><th>Status</th><th>Paid on</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono">{p.reference}</td>
                    <td>₦{Number(p.amount).toLocaleString("en-NG")}</td>
                    <td>{formatEnum(p.status)}</td>
                    <td>{p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-GB") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="print-paid-note">
            Fee status: <strong>{paid ? "PAID" : "NOT PAID"}</strong>
          </p>
        </section>

        {/* H — Documents */}
        <section>
          <Heading>H — Attached Documents</Heading>
          {docs.length === 0 ? (
            <p className="print-empty">No documents attached.</p>
          ) : (
            <table className="print-table">
              <thead><tr><th>Type</th><th>File</th><th>Version</th><th>Verification</th></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>{formatEnum(d.documentType)}</td>
                    <td>{d.originalFileName}</td>
                    <td>v{d.version}</td>
                    <td>{formatEnum(d.verificationStatus ?? "PENDING")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Declaration + signature blocks */}
        <section className="print-declaration">
          <p>
            <strong>Declaration:</strong> I declare that the information provided in this application is true and
            accurate. I understand that giving false information will lead to disqualification, and that the
            application fee is non-refundable.
          </p>
          <div className="print-signatures">
            <div>
              <div className="print-sign-line" />
              <p>Applicant&apos;s signature &amp; date</p>
            </div>
            <div>
              <div className="print-sign-line" />
              <p>For the Registrar</p>
            </div>
          </div>
        </section>

        <footer className="print-footer">
          Generated {new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} ·{" "}
          {a.applicationNumber}
        </footer>
      </article>
    </div>
  );
}

/** Toolbar + autoprint island (screen only — .no-print removes it on paper). */
function PrintToolbar({ autoprint, id }: { autoprint: boolean; id: string }) {
  return (
    <>
      {autoprint && <AutoPrint />}
      <div className="print-toolbar no-print">
        <p className="text-[13px] text-ink-600">
          Official application form — use the print dialog to save as PDF.
        </p>
        <div className="flex gap-2">
          <a className="btn-outline btn-sm" href={`/applicant/application/${id}`}>
            ← Back to portal
          </a>
          <PrintButton />
        </div>
      </div>
    </>
  );
}
