import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { qrPng } from "@/lib/pdf/qr";
import type { InstitutionSettings } from "@/lib/settings";
import { programmeLabel } from "@/lib/format";

/**
 * Shape mirrors the Laravel dossier (GET /applicant/applications/{id}).
 * Optional sections (JAMB, qualifications, documents, olevel details) are
 * rendered when present — matching the /print/application/[id] page.
 */
type Subject = { subject: string; score?: number | null; grade?: string | null };
type OlevelLike = {
  id?: string;
  examinationType: string;
  examinationNumber: string;
  examinationYear: number;
  sittingNumber: number;
  subjects: Subject[];
};
type ApplicationLike = {
  applicationNumber: string;
  applicationType: string;
  studyMode: string;
  status: string;
  paymentStatus: string;
  permanentAddress?: string | null;
  currentAddress?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  maritalStatus?: string | null;
  religion?: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  applicant: {
    surname: string;
    firstName: string;
    middleName: string | null;
    dateOfBirth?: string | Date | null;
    gender?: string | null;
    nationality?: string | null;
    stateOfOrigin?: string | null;
    lga?: string | null;
    address?: string | null;
    user?: { email?: string | null; phone?: string | null } | null;
  };
  programme: { name: string; code: string; award: string | null };
  academicSession: { name: string };
  entryLevelValue?: number | null;
  jambResult?: {
    registrationNumber: string;
    examinationYear: number;
    utmeScore: number | null;
    institutionChoice: string | null;
    subjects: Subject[];
  } | null;
  olevelResults?: OlevelLike[];
  qualifications?: {
    qualification: string;
    institution: string;
    year: number;
    gradeClass: string | null;
  }[];
  payments: { reference: string; status: string; amount?: string | number; paidAt?: string | Date | null }[];
  documents?: { documentType: string; originalFileName: string; version: number; verificationStatus?: string | null }[];
};

/* ── Layout constants (A4, pdf-lib y grows upward) ─────────────────── */
const W = 595;
const H = 842;
const M = 44; // side margin
const INK = rgb(0, 0, 0);
const GRAY = rgb(0.35, 0.35, 0.35);
const LINE = rgb(0.6, 0.6, 0.6);

export async function buildAcknowledgementSlipPdf(args: {
  application: ApplicationLike;
  inst: InstitutionSettings;
  formatEnum: (s: string | null | undefined) => string;
}): Promise<Uint8Array> {
  const { application: app, inst, formatEnum } = args;
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([W, H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = H;
  const NEW_PAGE = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };
  const need = (h: number) => {
    if (y - h < M + 60) NEW_PAGE();
  };

  const text = (
    s: string,
    x: number,
    yy: number,
    size = 9.5,
    f = font,
    color = INK
  ) => page.drawText(s, { x, y: yy, size, font: f, color });

  /** One A—H section heading (uppercase rule + title), like the print page. */
  const heading = (title: string) => {
    need(34);
    y -= 18;
    page.drawLine({
      start: { x: M, y: y + 12 },
      end: { x: W - M, y: y + 12 },
      thickness: 1.1,
      color: INK,
    });
    text(title.toUpperCase(), M, y, 9, bold);
    y -= 14;
  };

  const fmtDate = (d: string | Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-GB") : null;
  // Standard Helvetica (WinAnsi) cannot encode ₦ — use NGN in the PDF.
  const fmtMoney = (n: string | number) =>
    `NGN ${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
  const dash = (v: string | null | undefined) => (v && String(v).trim() ? String(v) : "—");

  /* ── Letterhead (double rule, centred — same as print page) ── */
  y = H - M - 6;
  const nameSize = inst.name.length > 44 ? 13 : 15;
  const nameText = inst.name.toUpperCase();
  const nameWidth = bold.widthOfTextAtSize(nameText, nameSize);
  text(nameText, (W - nameWidth) / 2, y, nameSize, bold);
  y -= 15;
  const subText = "Application for Admission";
  const subWidth = font.widthOfTextAtSize(subText, 9.5);
  text(subText, (W - subWidth) / 2, y, 9.5, font, GRAY);
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 2.4, color: INK });
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: INK });

  /* ── Meta strip ── */
  y -= 20;
  const metaCols = [
    ["APPLICATION NO.", app.applicationNumber],
    ["SUBMITTED", fmtDate(app.submittedAt) ?? "Not submitted"],
    ["STATUS", formatEnum(app.status)],
  ] as const;
  const colW = (W - M * 2) / 3;
  metaCols.forEach(([label, value], i) => {
    const x = M + i * colW;
    text(label, x, y, 7, bold, GRAY);
    text(String(value), x, y - 11, 9.5, bold);
    page.drawLine({
      start: { x, y: y - 15 },
      end: { x: x + colW - 14, y: y - 15 },
      thickness: 0.5,
      color: LINE,
    });
  });
  y -= 26;

  /** Grid of label/value fields (3 columns, dotted underlines). */
  const fields = (rows: [string, string | null | undefined, boolean?][], cols = 3) => {
    const gap = 10;
    const cw = (W - M * 2 - gap * (cols - 1)) / cols;
    let i = 0;
    for (const [label, value, wide] of rows) {
      need(30);
      const span = wide ? cols : 1;
      const col = i % cols;
      const x = M + col * (cw + gap);
      const w = wide ? cw * cols + gap * (cols - 1) : cw;
      text(label.toUpperCase(), x, y, 6.8, bold, GRAY);
      const v = dash(value);
      // Shrink long values instead of overflowing the cell.
      let size = 9.5;
      while (font.widthOfTextAtSize(v, size) > w && size > 6.5) size -= 0.4;
      text(v, x, y - 11, size, bold);
      page.drawLine({
        start: { x, y: y - 15 },
        end: { x: x + w, y: y - 15 },
        thickness: 0.4,
        color: LINE,
      });
      i += span;
      if (col + span >= cols) y -= 26;
    }
    if (i % cols !== 0) y -= 26;
  };

  /** Bordered data table with header row. */
  const table = (headers: string[], rows: string[][]) => {
    need(26 + rows.length * 16);
    const widths = headers.map((h) => bold.widthOfTextAtSize(h.toUpperCase(), 7) + 16);
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = (W - M * 2) / total;
    const cw = widths.map((w) => w * scale);

    // Header
    let x = M;
    headers.forEach((h, i) => {
      page.drawRectangle({ x, y: y - 4, width: cw[i], height: 15, color: rgb(0.93, 0.93, 0.93) });
      page.drawRectangle({ x, y: y - 4, width: cw[i], height: 15, borderColor: INK, borderWidth: 0.7 });
      text(h.toUpperCase(), x + 6, y, 7, bold);
      x += cw[i];
    });
    y -= 15;

    for (const row of rows) {
      x = M;
      row.forEach((cell, i) => {
        page.drawRectangle({ x, y: y - 4, width: cw[i], height: 15, borderColor: INK, borderWidth: 0.7 });
        const v = dash(cell);
        let size = 8.5;
        while (font.widthOfTextAtSize(v, size) > cw[i] - 10 && size > 6) size -= 0.3;
        text(v, x + 6, y, size, font);
        x += cw[i];
      });
      y -= 15;
    }
    y -= 6;
  };

  const ap = app.applicant;
  const fullName = [ap.surname, ap.firstName, ap.middleName].filter(Boolean).join(" ");

  /* ── A — BIO DATA ── */
  heading("A — Bio Data");
  fields([
    ["Surname", ap.surname],
    ["First name", ap.firstName],
    ["Other names", ap.middleName],
    ["Date of birth", fmtDate(ap.dateOfBirth)],
    ["Gender", formatEnum(ap.gender)],
    ["Marital status", formatEnum(app.maritalStatus)],
    ["Religion", formatEnum(app.religion)],
    ["Nationality", ap.nationality],
    ["State of origin", ap.stateOfOrigin],
    ["LGA", ap.lga],
    ["Phone", ap.user?.phone ?? null],
    ["Email", ap.user?.email ?? null],
    ["Residential address", ap.address, true],
  ]);

  /* ── B — CONTACT INFORMATION ── */
  heading("B — Contact Information");
  fields([
    ["Permanent address", app.permanentAddress, true],
    ["Current address", app.currentAddress, true],
    ["Emergency contact", [app.emergencyContactName, app.emergencyContactPhone].filter(Boolean).join(" · "), true],
  ]);

  /* ── C — PROGRAMME CHOICE ── */
  heading("C — Programme Choice");
  fields([
    ["Programme", programmeLabel(app.programme), true],
    ["Application type", formatEnum(app.applicationType)],
    ["Study mode", formatEnum(app.studyMode)],
    ["Entry level", app.entryLevelValue != null ? String(app.entryLevelValue) : null],
    ["Academic session", app.academicSession.name],
  ]);

  /* ── D — O'LEVEL RESULTS ── */
  heading("D — O'Level Results");
  if (!app.olevelResults?.length) {
    text("No O'Level results provided.", M, y, 9, font, GRAY);
    y -= 14;
  }
  for (const r of app.olevelResults ?? []) {
    need(40);
    text(
      `${formatEnum(r.examinationType)} · ${r.examinationNumber || "—"} · ${r.examinationYear} · ${r.sittingNumber === 2 ? "Second sitting" : "First sitting"}`,
      M,
      y,
      8.5,
      bold
    );
    y -= 14;
    table(
      ["Subject", "Grade"],
      (r.subjects ?? []).map((s) => [s.subject, s.grade ?? "—"])
    );
  }

  /* ── E — JAMB (UTME) ── */
  if (app.jambResult) {
    heading("E — JAMB Details");
    fields([
      ["Registration no.", app.jambResult.registrationNumber],
      ["Examination year", String(app.jambResult.examinationYear)],
      ["UTME score", app.jambResult.utmeScore != null ? String(app.jambResult.utmeScore) : null],
      ["Institution choice", app.jambResult.institutionChoice],
    ]);
    if (app.jambResult.subjects?.length) {
      table(
        ["Subject", "Score"],
        app.jambResult.subjects.map((s) => [s.subject, s.score != null ? String(s.score) : "—"])
      );
    }
  }

  /* ── F — PREVIOUS QUALIFICATIONS (Direct Entry) ── */
  if (app.qualifications?.length) {
    heading("F — Previous Qualifications");
    table(
      ["Qualification", "Institution", "Year", "Grade / class"],
      app.qualifications.map((q) => [
        formatEnum(q.qualification),
        q.institution,
        String(q.year),
        q.gradeClass ?? "—",
      ])
    );
  }

  /* ── G — APPLICATION FEE ── */
  heading("G — Application Fee");
  if (app.payments.length === 0) {
    text("No payment recorded.", M, y, 9, font, GRAY);
    y -= 14;
  } else {
    table(
      ["Reference", "Amount", "Status", "Paid on"],
      app.payments.map((p) => [
        p.reference,
        p.amount != null ? fmtMoney(p.amount) : "—",
        formatEnum(p.status),
        fmtDate(p.paidAt) ?? "—",
      ])
    );
  }
  const paid = app.payments.some((p) => p.status === "SUCCESSFUL");
  need(14);
  text(`Fee status: ${paid ? "PAID" : "NOT PAID"}`, M, y, 9, bold);
  y -= 14;

  /* ── H — ATTACHED DOCUMENTS ── */
  heading("H — Attached Documents");
  if (!app.documents?.length) {
    text("No documents attached.", M, y, 9, font, GRAY);
    y -= 20;
  } else {
    table(
      ["Type", "File", "Version", "Verification"],
      app.documents.map((d) => [
        formatEnum(d.documentType),
        d.originalFileName,
        `v${d.version}`,
        formatEnum(d.verificationStatus ?? "PENDING"),
      ])
    );
  }

  /* ── Declaration + signatures ── */
  need(120);
  y -= 10;
  const boxTop = y;
  const boxHeight = 46;
  page.drawRectangle({ x: M, y: boxTop - boxHeight, width: W - M * 2, height: boxHeight, borderColor: INK, borderWidth: 0.9, color: rgb(0.98, 0.98, 0.98) });
  const declText =
    "Declaration: I declare that the information provided in this application is true and accurate. I understand that giving false information will lead to disqualification, and that the application fee is non-refundable.";
  // naive 2-line wrap
  let line1 = declText;
  let line2 = "";
  const maxW = W - M * 2 - 20;
  while (bold.widthOfTextAtSize(line1, 8) > maxW) {
    const idx = line1.lastIndexOf(" ");
    line2 = line1.slice(idx) + line2;
    line1 = line1.slice(0, idx);
  }
  text(line1, M + 10, boxTop - 14, 8, bold);
  text(line2.trim(), M + 10, boxTop - 25, 8, bold);
  // QR block, right side inside the box
  try {
    const verifyUrl = `https://${inst.domain}/verify/application/${app.applicationNumber}`;
    const qrImage = await pdf.embedPng(await qrPng(verifyUrl));
    const qrSize = 54;
    page.drawImage(qrImage, { x: W - M - qrSize - 12, y: boxTop - boxHeight + 6, width: qrSize, height: qrSize });
  } catch {
    // QR is decorative; the slip is valid without it.
  }
  y = boxTop - boxHeight - 8;

  // Signature lines
  need(60);
  y -= 34;
  const sigW = 200;
  page.drawLine({ start: { x: M, y }, end: { x: M + sigW, y }, thickness: 0.9, color: INK });
  page.drawLine({ start: { x: W - M - sigW, y }, end: { x: W - M, y }, thickness: 0.9, color: INK });
  text("Applicant's signature & date", M, y - 11, 7.5, font, GRAY);
  text(`For the Registrar — ${inst.shortName} Admissions Office`, W - M - sigW, y - 11, 7.5, font, GRAY);

  /* ── Footer ── */
  const footer = `Generated ${new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · ${app.applicationNumber}`;
  const fw = font.widthOfTextAtSize(footer, 7.5);
  text(footer, (W - fw) / 2, 36, 7.5, font, GRAY);

  return pdf.save();
}
