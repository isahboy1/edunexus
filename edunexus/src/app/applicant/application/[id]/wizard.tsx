"use client";

/**
 * Application wizard — mirrors the official AKCILS "How to fill the online
 * application form" flow (instructions1.pdf):
 *   1. PAYMENT first (form unlocks only after successful payment)
 *   2. Four stages: BIODATA → ACADEMICS → O'LEVEL (first + second sitting) → ATTACHMENTS
 *   3. After submission: print acknowledgement slip (Edit is locked)
 *
 * Navigation is a sticky progress sidebar (horizontal chip strip on mobile)
 * with per-stage completion state, matching the portal design system.
 */

import { FormEvent, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, Alert, StatusBadge, PageHeader } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { formatNaira, programmeLabel } from "@/lib/format";
import { api, apiUpload, apiDelete } from "@/lib/laravel";

type Doc = { id: string; documentType: string; originalFileName: string; version: number; fileSize: number };
type Payment = { id: string; reference: string; status: string; amount: string | number };

export interface WizardApplication {
  id: string;
  applicationNumber: string;
  status: string;
  paymentStatus: string;
  applicationType: string;
  studyMode: string;
  entryLevelValue: number | null;
  permanentAddress: string | null;
  currentDateAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactAddress: string | null;
  maritalStatus: string | null;
  religion: string | null;
  programme: { id: string; name: string; code: string; award: string | null };
  academicSession: { id: string; name: string };
  jambResult: {
    registrationNumber: string; examinationYear: number; utmeScore: number | null;
    institutionChoice: string | null;
    subjects: { subject: string; score: number }[];
  } | null;
  olevelResults: {
    id: string; examinationType: string; examinationNumber: string; examinationYear: number;
    sittingNumber: number; subjects: { subject: string; grade: string }[];
  }[];
  documents: Doc[];
  payments: Payment[];
}

export interface WizardApplicant {
  surname: string; firstName: string; middleName: string | null;
  dateOfBirth: string | null; gender: string | null; nationality: string | null;
  stateOfOrigin: string | null; lga: string | null; address: string | null;
  phone: string | null;
}

/** Shape of GET …/completeness (ApplicationCompletenessService). */
export type CompletenessSection = { key: string; label: string; complete: boolean; missing: string[] };
export type Completeness = { ready: boolean; sections: CompletenessSection[]; problems: string[] };

const GRADES = ["A1", "B2", "B3", "C4", "C5", "C6", "D7", "E8", "F9"].map((g) => ({ value: g, label: g }));
const COMMON_SUBJECTS = ["English Language", "Mathematics", "Biology", "Chemistry", "Physics", "Economics", "Government", "Literature-in-English", "CRS", "IRS", "Arabic Studies", "Hausa", "Agricultural Science", "Commerce", "Geography", "Yoruba", "Further Mathematics", "Islamic Studies"];

/** Official AKCILS stages: payment gate → BIODATA → ACADEMICS → O'LEVEL → ATTACHMENTS */
const STEPS: { label: string; caption: string; icon: IconName }[] = [
  { label: "Payment", caption: "Pay the application fee", icon: "wallet" },
  { label: "Bio Data", caption: "Personal & contact details", icon: "user" },
  { label: "Academics", caption: "Programme & study mode", icon: "book" },
  { label: "O'Level", caption: "First & second sittings", icon: "clipboard" },
  { label: "Attachments & Submit", caption: "Documents & declaration", icon: "file" },
];

export function ApplicationWizard({
  application,
  applicant,
  fee,
  completeness,
}: {
  application: WizardApplication;
  applicant: WizardApplicant;
  fee: number;
  completeness: Completeness | null;
}) {
  const router = useRouter();
  // Payment is the mandatory first stage; skip past it when already paid.
  const paid = application.payments.some((p) => p.status === "SUCCESSFUL");
  const [step, setStep] = useState(paid ? 1 : 0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [declaration, setDeclaration] = useState(false);

  const editable = ["DRAFT", "PAYMENT_PENDING", "PAID"].includes(application.status);
  const docs = application.documents;
  const hasPassport = docs.some((d) => d.documentType === "PASSPORT");

  // First & second sitting records (official AKCILS two-sitting support)
  const firstSitting = application.olevelResults.find((r) => r.sittingNumber === 1) ?? null;
  const secondSitting = application.olevelResults.find((r) => r.sittingNumber === 2) ?? null;

  const personalComplete = Boolean(
    applicant.dateOfBirth && applicant.gender && applicant.stateOfOrigin && applicant.address
  );
  const contactComplete = Boolean(
    application.permanentAddress && application.emergencyContactName && application.emergencyContactPhone
  );
  const olevelComplete = application.olevelResults.some((r) => r.subjects.length > 0);  // Per-section truth from the backend completeness endpoint (falls back to
  // client-side checks when the endpoint is unavailable).
  const section = (key: string) => completeness?.sections.find((s) => s.key === key) ?? null;

  // Per-stage completion — drives the sidebar states.
  const stepComplete = useMemo(
    () => [
      section("payment")?.complete ?? paid,
      (section("personal")?.complete ?? personalComplete) && (section("contact")?.complete ?? contactComplete),
      true, // informational stage — programme was chosen at application start
      (section("olevel")?.complete ?? olevelComplete) && (section("jamb")?.complete ?? true) && (section("qualifications")?.complete ?? true),
      !editable, // final stage completes on submission
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [completeness, paid, personalComplete, contactComplete, olevelComplete, editable]
  );
  const completedCount = stepComplete.filter(Boolean).length;

  // Missing-field hints per stage — exactly what the applicant still owes.
  const stageHints = useMemo(
    () => [
      section("payment")?.complete === false ? ["Application fee not paid"] : [],
      [...(section("personal")?.missing ?? []), ...(section("contact")?.missing ?? [])],
      [] as string[],
      [
        ...(section("olevel")?.missing ?? []),
        ...(section("jamb")?.missing ?? []),
        ...(section("qualifications")?.missing ?? []),
      ],
      section("documents")?.missing ?? [],
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [completeness]
  );



  // Submission gate mirrors the backend readiness endpoint when available.
  const canSubmit = useMemo(() => {
    if (completeness) return completeness.ready;
    return (
      paid &&
      hasPassport &&
      Boolean(applicant.dateOfBirth && applicant.gender && applicant.stateOfOrigin && applicant.address) &&
      application.olevelResults.some((r) => r.subjects.length > 0)
    );
  }, [completeness, paid, hasPassport, applicant, application]);

  async function saveSection(e: FormEvent<HTMLFormElement>, section: string, onDone?: () => void) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => String(fd.get(k) ?? "").trim();

    // Laravel PATCH expects nested section objects: personal / contact / olevel.
    let body: Record<string, unknown>;
    if (section === "personal") {
      body = {
        personal: {
          surname: str("surname"),
          firstName: str("firstName"),
          middleName: str("middleName") || null,
          dateOfBirth: str("dateOfBirth"),
          gender: str("gender"),
          maritalStatus: str("maritalStatus"),
          religion: str("religion"),
          nationality: str("nationality"),
          stateOfOrigin: str("stateOfOrigin"),
          lga: str("lga"),
          phone: str("phone"),
          address: str("residentialAddress"),
        },
        contact: {
          permanentAddress: str("permanentAddress"),
          // Readiness gate requires current_address too — mirror the
          // residential address when no separate current address is entered.
          currentAddress: str("currentAddress") || str("residentialAddress"),
          emergencyContactName: str("emergencyContactName"),
          emergencyContactPhone: str("emergencyContactPhone"),
        },
      };
    } else {
      body = {
        olevel: {
          examinationType: str("examinationType"),
          examinationNumber: str("examinationNumber"),
          examinationYear: Number(fd.get("examinationYear")),
          sittingNumber: Number(fd.get("sittingNumber") || 1),
          subjects: [1, 2, 3, 4, 5, 6, 7, 8]
            .map((i) => ({ subject: fd.get(`os${i}`), grade: fd.get(`og${i}`) }))
            .filter((s) => s.subject && s.grade)
            .map((s) => ({ subject: s.subject, grade: String(s.grade) })),
        },
      };
    }

    const res = await api(`/applicant/applications/${application.id}`, { method: "PATCH", body });
    if (!res.ok) {
      const first = Object.values(res.errors)[0]?.[0];
      setError(first ?? res.message ?? "Save failed");
      return;
    }
    setMessage("Saved successfully");
    onDone?.();
    router.refresh();
  }

  async function uploadDoc(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget); // multipart: documentType + document file
    try {
      const res = await apiUpload(`/applicant/applications/${application.id}/documents`, fd);
      if (!res.ok) {
        setError(res.message || "Upload failed");
        return;
      }
      setMessage("Document uploaded");
      (e.currentTarget as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteDoc(docId: string) {
    setBusy(true);
    try {
      await apiDelete(`/applicant/applications/${application.id}/documents/${docId}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function startPayment() {
    setBusy(true);
    setError(null);
    const res = await api(`/applicant/applications/${application.id}/payments`, { method: "POST" });
    if (!res.ok) {
      setError(res.message || "Payment initialization failed");
      setBusy(false);
      return;
    }
    // Mock gateway → hosted checkout URL; Remita → RRR bank instruction page.
    const gw = (res.data as Record<string, any> | null)?.gatewayResponse ?? {};
    const url: string | undefined = gw.checkoutUrl ?? gw.instructionUrl;
    if (!url) {
      setError("Could not obtain a payment URL — please try again.");
      setBusy(false);
      return;
    }
    window.location.href = url;
  }

  async function submitApplication() {
    if (!declaration) {
      setError('You must check "I AGREE" on the declaration before submitting');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await api(`/applicant/applications/${application.id}/submit`, { method: "POST" });
    if (!res.ok) {
      const problems = (res.data as { problems?: string[] } | null)?.problems;
      setError(problems?.length ? problems.join(" • ") : res.message || "Submission failed");
      return;
    }
    router.refresh();
    setStep(4);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <PageHeader
        eyebrow="Application"
        title={`Application ${application.applicationNumber}`}
        description={`${programmeLabel(application.programme)} · ${application.academicSession.name}`}
        icon="file"
        actions={
          <>
            <StatusBadge status={application.status} />
            <Link className="btn-outline btn-sm" href="/applicant/dashboard">
              Back to dashboard
            </Link>
          </>
        }
      />

      {error && <div className="mt-4"><Alert kind="error">{error}</Alert></div>}
      {message && <div className="mt-4"><Alert kind="success">{message}</Alert></div>}

      {!editable && (
        <div className="mt-4">
          <Alert kind="info">This application has been submitted and is locked.</Alert>
        </div>
      )}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <WizardSidebar
          step={step}
          onSelect={setStep}
          stepComplete={stepComplete}
          completedCount={completedCount}
          paid={paid}
          stageHints={stageHints}
        />

        <div className="min-w-0 space-y-5">

          {/* STAGE 1 — PAYMENT (official flow: pay first, form unlocks after) */}
          {step === 0 && (
            <StepShell
              stage={1}
              icon="wallet"
              title="Application Fee"
              description="Pay the non-refundable fee via the payment platform. The application form (Bio Data, Academics, O'Level, Attachments) unlocks immediately after a successful payment."
            >
              <div className="rounded-lg border border-[var(--line)] bg-brand-50 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-brand-900">
                    Application Fee — {application.academicSession.name}
                  </span>
                  <span className="currency text-lg font-extrabold text-brand-900">
                    <span className="currency-sign">₦</span>{Number(fee).toLocaleString("en-NG", { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {application.payments.length > 0 && (
                <div className="mt-4 space-y-2">
                  {application.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm">
                      <span className="font-mono text-xs text-ink-600">{p.reference}</span>
                      <StatusBadge status={p.status} />
                    </div>
                  ))}
                </div>
              )}

              {!paid && editable && (
                <div className="mt-5">
                  <button type="button" className="btn-primary btn-lg" onClick={startPayment} disabled={busy}>
                    {busy ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                        Redirecting…
                      </>
                    ) : (
                      <>Pay {formatNaira(fee)} Now <Icon name="arrowRight" className="h-4 w-4" /></>
                    )}
                  </button>
                </div>
              )}
              {paid && (
                <div className="mt-5 space-y-3">
                  <Alert kind="success">Payment confirmed. Continue to Bio Data.</Alert>
                  <button type="button" className="btn-primary" onClick={() => setStep(1)}>
                    Continue to Application Form <Icon name="arrowRight" className="h-4 w-4" />
                  </button>
                </div>
              )}
            </StepShell>
          )}

          {/* STAGE 2 — BIODATA */}
          {step === 1 && (
            <form onSubmit={(e) => saveSection(e, "personal", () => setStep(2))}>
              <StepShell
                stage={2}
                icon="user"
                title="Bio Data"
                description="Your personal details and contact information as they should appear on official records."
              >
                <GroupLabel>Personal details</GroupLabel>
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  <Field label="Surname" name="surname" required defaultValue={applicant.surname} />
                  <Field label="First Name" name="firstName" required defaultValue={applicant.firstName} />
                  <Field label="Other Names" name="middleName" defaultValue={applicant.middleName ?? ""} />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Field label="Date of Birth" name="dateOfBirth" type="date" required defaultValue={applicant.dateOfBirth?.slice(0, 10) ?? ""} />
                  <Field label="Gender" name="gender" required defaultValue={applicant.gender ?? ""}
                    options={[{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }]} />
                  <Field label="Marital Status" name="maritalStatus" required defaultValue={application.maritalStatus ?? ""}
                    options={[{ value: "SINGLE", label: "Single" }, { value: "MARRIED", label: "Married" }, { value: "OTHER", label: "Other" }]} />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Field label="Nationality" name="nationality" required defaultValue={applicant.nationality ?? "Nigerian"} />
                  <Field label="State of Origin" name="stateOfOrigin" required defaultValue={applicant.stateOfOrigin ?? ""} />
                  <Field label="LGA" name="lga" required defaultValue={applicant.lga ?? ""} />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Religion" name="religion" defaultValue={application.religion ?? ""}
                    options={[{ value: "ISLAM", label: "Islam" }, { value: "CHRISTIANITY", label: "Christianity" }, { value: "OTHER", label: "Other" }]} />
                  <Field label="Phone" name="phone" required defaultValue={applicant.phone ?? ""} />
                </div>

                <div className="mt-6 border-t border-slate-100 pt-5">
                  <GroupLabel>Residential & contact</GroupLabel>
                  <div className="mt-3 grid gap-4">
                    <Field label="Residential Address" name="residentialAddress" textarea required defaultValue={applicant.address ?? ""} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Permanent Address" name="permanentAddress" textarea required defaultValue={application.permanentAddress ?? ""} />
                  </div>
                </div>

                <div className="mt-6 border-t border-slate-100 pt-5">
                  <GroupLabel>Emergency contact</GroupLabel>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field label="Emergency Contact Name" name="emergencyContactName" required defaultValue={application.emergencyContactName ?? ""} />
                    <Field label="Emergency Contact Phone" name="emergencyContactPhone" required defaultValue={application.emergencyContactPhone ?? ""} />
                  </div>
                </div>

                {editable && <FormFooter onBack={() => setStep(0)} busy={busy} label="Save & Continue" />}
              </StepShell>
            </form>
          )}

          {/* STAGE 3 — ACADEMICS (study mode, programme, course + sitting selection) */}
          {step === 2 && (
            <StepShell
              stage={3}
              icon="book"
              title="Academics"
              description="Selected at application start. Contact the admissions office to change your programme."
            >
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <Fact label="Study Mode">{formatLabel(application.studyMode)}</Fact>
                <Fact label="Programme / Course">{programmeLabel(application.programme)}</Fact>
                <Fact label="Application Type">{formatLabel(application.applicationType)}</Fact>
                <Fact label="Entry Level">{application.entryLevelValue ?? 100}</Fact>
              </dl>
              <div className="mt-5 flex items-start gap-3 rounded-lg border border-[var(--line)] bg-slate-50 p-4">
                <Icon name="info" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-600" />
                <p className="text-sm text-ink-600">
                  In the next stage, enter your O&apos;Level result for the <strong className="font-semibold text-ink-900">First Sitting</strong>.
                  If you have more than one sitting, also complete the <strong className="font-semibold text-ink-900">Second Sitting</strong> section —
                  additional space is provided for both.
                </p>
              </div>
              <div className="mt-5 flex gap-2">
                <button type="button" className="btn-primary" onClick={() => setStep(3)}>
                  Continue <Icon name="arrowRight" className="h-4 w-4" />
                </button>
                <button type="button" className="btn-ghost" onClick={() => setStep(1)}>← Back</button>
              </div>
            </StepShell>
          )}

          {/* STAGE 4 — O'LEVEL (first + second sitting, per official guide) */}
          {step === 3 && (
            <div className="space-y-5">
              <SittingForm
                title="First Sitting"
                sittingNumber={1}
                result={firstSitting}
                busy={busy}
                editable={editable}
                onSave={(e, onDone) => saveSection(e, "olevel", onDone)}
                onNext={() => setStep(4)}
                onBack={() => setStep(2)}
              />
              <SittingForm
                title="Second Sitting"
                optional
                sittingNumber={2}
                result={secondSitting}
                busy={busy}
                editable={editable}
                onSave={(e, onDone) => saveSection(e, "olevel", onDone)}
                onNext={() => setStep(4)}
                onBack={() => setStep(2)}
              />
            </div>
          )}

          {/* STAGE 5 — ATTACHMENTS + declaration + submit */}
          {step === 4 && (
            <StepShell
              stage={5}
              icon="file"
              title="Attachments & Submit"
              description="Upload your passport photograph and credentials. PDF, JPG or PNG • max 2MB each."
            >
              {editable && (
                <form className="grid gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={uploadDoc}>
                  <div>
                    <label className="label" htmlFor="documentType">Document Type</label>
                    <select className="select" id="documentType" name="documentType" required>
                      <option value="PASSPORT">Passport Photograph</option>
                      <option value="OLEVEL_RESULT">O-Level Result</option>
                      <option value="JAMB_RESULT">JAMB Result</option>
                      <option value="BIRTH_CERTIFICATE">Birth Certificate / Declaration</option>
                      <option value="LGA_CERTIFICATE">Local Government Certificate</option>
                      <option value="NCE_CERTIFICATE">NCE Certificate</option>
                      <option value="ND_CERTIFICATE">ND Certificate</option>
                      <option value="HND_CERTIFICATE">HND Certificate</option>
                      <option value="IJMB_RESULT">IJMB Result</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="document">File</label>
                    <input className="input" id="document" name="document" type="file" accept=".pdf,.jpg,.jpeg,.png" required />
                  </div>
                  <div className="flex items-end">
                    <button className="btn-primary" disabled={busy}>
                      {busy ? "Uploading…" : <><Icon name="download" className="h-4 w-4 rotate-180" /> Upload</>}
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-5 overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr><th>Type</th><th>File</th><th>Version</th><th>Size</th><th></th></tr>
                  </thead>
                  <tbody>
                    {docs.length === 0 && (
                      <tr><td colSpan={5} className="text-ink-400">No documents uploaded yet.</td></tr>
                    )}
                    {docs.map((d) => (
                      <tr key={d.id}>
                        <td className="font-semibold">{formatLabel(d.documentType)}</td>
                        <td className="max-w-[220px] truncate">{d.originalFileName}</td>
                        <td>v{d.version}</td>
                        <td>{(d.fileSize / 1024).toFixed(0)} KB</td>
                        <td>
                          {editable && (
                            <button type="button" className="btn-danger btn-sm" onClick={() => deleteDoc(d.id)}>Remove</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!editable ? (
                <>
                  <div className="mt-5"><Alert kind="success">Application submitted successfully.</Alert></div>
                  <a
                    className="btn-primary btn-lg mt-4 inline-flex"
                    href={`/print/application/${application.id}?autoprint=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="printer" className="h-4.5 w-4.5" /> Print / Download Application Form
                  </a>
                  <a className="btn-outline btn-lg mt-4 ml-2 inline-flex" href={`/api/v1/applicant/applications/${application.id}/slip`}>
                    <Icon name="download" className="h-4.5 w-4.5" /> PDF slip
                  </a>
                </>
              ) : (
                <>
                  <div className="mt-6 border-t border-slate-100 pt-5">
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--line)] bg-brand-50/60 p-4 text-sm transition hover:border-brand-300">
                      <input type="checkbox" className="mt-0.5 h-4 w-4" checked={declaration} onChange={(e) => setDeclaration(e.target.checked)} />
                      <span className="text-ink-700">
                        <strong className="font-semibold text-ink-900">Declaration:</strong> I declare that the information provided in
                        this application is true and accurate. I understand that giving false information will lead to
                        disqualification, and that the application fee is non-refundable.
                      </span>
                    </label>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button type="button" className="btn-primary btn-lg" onClick={submitApplication} disabled={busy || !canSubmit}>
                      {busy ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                          Submitting…
                        </>
                      ) : (
                        <>
                          <Icon name="checkCircle" className="h-4.5 w-4.5" /> Submit Application Form
                        </>
                      )}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setStep(3)}>← Back</button>
                  </div>
                  {!canSubmit && (
                    <ul className="mt-3 list-inside list-disc text-xs text-ink-600">
                      {(completeness?.problems.length
                        ? completeness.problems
                        : [
                            !paid && "Application fee not paid",
                            !hasPassport && "Passport photograph not uploaded",
                            !(applicant.dateOfBirth && applicant.gender && applicant.stateOfOrigin) && "Bio Data incomplete",
                            !application.olevelResults.some((r) => r.subjects.length > 0) && "O'Level subjects missing",
                          ].filter(Boolean)
                      ).map((t) => (
                        <li key={t as string}>{t}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </StepShell>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Wizard building blocks ─────────────────────────────── */

/**
 * Sticky progress sidebar (horizontal chip strip on mobile). Every stage is
 * clickable: completed (emerald check), current (brand ring), upcoming (muted).
 */
function WizardSidebar({
  step,
  onSelect,
  stepComplete,
  completedCount,
  paid,
  stageHints,
}: {
  step: number;
  onSelect: (i: number) => void;
  stepComplete: boolean[];
  completedCount: number;
  paid: boolean;
  stageHints: string[][];
}) {
  return (
    <aside
      className="card-flush animate-fade-up self-start lg:sticky lg:top-6"
      aria-label="Application progress"
    >
      <div className="border-b border-[var(--line)] px-5 py-4">
        <h2 className="text-[15px] font-bold text-ink-900">Application stages</h2>
        <p className="mt-0.5 text-xs text-ink-600">
          {completedCount} of {STEPS.length} complete
        </p>
        <div className="progress-track mt-3">
          <div className="progress-fill" style={{ width: `${(completedCount / STEPS.length) * 100}%` }} role="progressbar" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={STEPS.length} aria-label="Stages completed" />
        </div>
      </div>

      {/* Horizontal chips on mobile, vertical rail from lg up */}
      <ol className="flex gap-1.5 overflow-x-auto px-3 py-3 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-3 lg:py-2">
        {STEPS.map((s, i) => {
          const complete = stepComplete[i];
          const current = i === step;
          return (
            <li key={s.label} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={current ? "step" : undefined}
                className={`group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition ${
                  current ? "bg-brand-50 ring-1 ring-inset ring-brand-100" : "hover:bg-slate-50"
                }`}
              >
                <StepDot index={i} complete={complete} current={current} icon={s.icon} />
                <span className="min-w-0">
                  <span className={`block whitespace-nowrap text-[13px] font-semibold lg:whitespace-normal ${
                    current ? "text-brand-900" : complete ? "text-ink-900" : "text-ink-600"
                  }`}>
                    {i + 1}. {s.label}
                  </span>
                  <span className="hidden whitespace-nowrap text-[11px] text-ink-400 lg:block lg:whitespace-normal">
                    {i === 0 && paid ? "Fee paid" : s.caption}
                  </span>
                </span>
                {complete && !current && (
                  <Icon name="checkCircle" className="ml-auto hidden h-4 w-4 shrink-0 text-emerald-500 lg:block" />
                )}
              </button>
              {/* Missing-field hints: exactly what the backend still expects. */}
              {!complete && stageHints[i]?.length > 0 && (
                <ul className="ml-[42px] hidden pb-1.5 lg:block" aria-label={`${s.label} missing fields`}>
                  {stageHints[i].map((h) => (
                    <li key={h} className="flex items-start gap-1.5 py-0.5 text-[11px] leading-snug text-amber-700">
                      <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                      {h}
                    </li>
                  ))}
                </ul>
              )}
              {i < STEPS.length - 1 && (
                <div className="ml-[27px] hidden h-1.5 w-px bg-slate-200 lg:block" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      <div className="hidden border-t border-[var(--line)] px-5 py-3.5 lg:block">
        <p className="text-[11px] leading-relaxed text-ink-400">
          All stages are audited. Your form unlocks only after the application fee is paid, and
          locks for editing once submitted.
        </p>
      </div>
    </aside>
  );
}

function StepDot({
  index,
  complete,
  current,
  icon,
}: {
  index: number;
  complete: boolean;
  current: boolean;
  icon: IconName;
}) {
  const base = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition";
  if (complete) {
    return (
      <span className={`${base} bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200/80`}>
        <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.4} />
      </span>
    );
  }
  if (current) {
    return (
      <span className={`${base} bg-brand-700 text-white shadow-sm ring-2 ring-brand-100`}>
        {index + 1}
      </span>
    );
  }
  return (
    <span className={`${base} bg-slate-100 text-ink-400 ring-1 ring-inset ring-slate-200`}>
      <Icon name={icon} className="h-4 w-4" />
    </span>
  );
}

/** Uniform stage card: eyebrow ("STAGE N OF 5"), icon header, body, used by every stage. */
function StepShell({
  stage,
  icon,
  title,
  description,
  children,
}: {
  stage: number;
  icon: IconName;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="card-p animate-fade-up">
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
            Stage {stage} of {STEPS.length}
          </p>
          <h2 className="text-[17px] font-extrabold leading-tight text-ink-900">{title}</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">{children}</p>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-1 text-[13px] font-semibold text-ink-900">{children}</dd>
    </div>
  );
}

function FormFooter({ onBack, busy, label }: { onBack: () => void; busy: boolean; label: string }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-5">
      <button type="button" className="btn-ghost" onClick={onBack}>← Back</button>
      <button className="btn-primary" disabled={busy}>
        {busy ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
            Saving…
          </>
        ) : (
          <>{label} <Icon name="arrowRight" className="h-4 w-4" /></>
        )}
      </button>
    </div>
  );
}

/** One O'Level sitting block (official AKCILS: first and/or second sitting) */
function SittingForm({
  title, optional = false, sittingNumber, result, busy, editable, onSave, onNext, onBack,
}: {
  title: string;
  optional?: boolean;
  sittingNumber: number;
  result: { examinationType: string; examinationNumber: string; examinationYear: number; subjects: { subject: string; grade: string }[] } | null;
  busy: boolean;
  editable: boolean;
  onSave: (e: FormEvent<HTMLFormElement>, onDone?: () => void) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const filled = (result?.subjects?.length ?? 0) > 0;
  return (
    <form className="card-p animate-fade-up" onSubmit={(e) => onSave(e, onNext)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3.5">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
            <Icon name="clipboard" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
              Stage 4 of {STEPS.length} · {title}
            </p>
            <h2 className="text-[17px] font-extrabold leading-tight text-ink-900">
              O&apos;Level Result{sittingNumber === 2 ? " (optional)" : ""}
            </h2>
          </div>
        </div>
        {filled ? (
          <span className="badge-green"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />Filled</span>
        ) : optional ? (
          <span className="badge-gray"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />Optional</span>
        ) : (
          <span className="badge-amber"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />Required</span>
        )}
      </div>
      {optional && (
        <p className="mt-2 text-[13px] text-ink-600">
          Only complete this section if you have more than one sitting.
        </p>
      )}

      <input type="hidden" name="sittingNumber" value={sittingNumber} />
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <Field label="Examination Type" name="examinationType" required
          defaultValue={result?.examinationType ?? ""}
          options={[
            { value: "WAEC", label: "WAEC" }, { value: "NECO", label: "NECO" },
            { value: "NABTEB", label: "NABTEB" }, { value: "NBAIS", label: "NBAIS" }, { value: "OTHER", label: "Other" },
          ]} />
        <Field label="Exam Number" name="examinationNumber" required defaultValue={result?.examinationNumber ?? ""} />
        <Field label="Exam Year" name="examinationYear" type="number" required defaultValue={result?.examinationYear ?? new Date().getFullYear() - 1} />
        <div>
          <label className="label">Sitting</label>
          <div className="input bg-slate-50 text-sm font-semibold text-ink-700">{sittingNumber === 1 ? "First" : "Second"}</div>
        </div>
      </div>

      <p className="mt-5 text-sm font-semibold text-ink-900">Subjects &amp; Grades</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="flex gap-2">
            <input className="input" name={`os${i}`} list="common-subjects" placeholder={`Subject ${i}`} defaultValue={result?.subjects?.[i - 1]?.subject ?? ""} />
            <select className="select w-28" name={`og${i}`} defaultValue={result?.subjects?.[i - 1]?.grade ?? ""} aria-label={`Grade for subject ${i}`}>
              <option value="">Grade</option>
              {GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
        ))}
      </div>
      <datalist id="common-subjects">
        {COMMON_SUBJECTS.map((s) => <option key={s} value={s} />)}
      </datalist>

      {editable && <FormFooter onBack={onBack} busy={busy} label="Save & Continue" />}
    </form>
  );
}

function formatLabel(s: string) {
  return s.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}
