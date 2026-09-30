import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { qrPng } from "@/lib/pdf/qr";
import type { InstitutionSettings } from "@/lib/settings";

/**
 * Printable fee-payment receipt PDF (A4). Layout mirrors the acknowledgement
 * slip (src/lib/pdf/slip.ts): centred letterhead, meta strip, dotted-field
 * grid, declaration box with QR, signature lines, centred footer. Amounts use
 * the "NGN" prefix — standard Helvetica (WinAnsi) cannot encode ₦.
 */

type ReceiptLike = {
  reference: string;
  amount: number;
  currency: string;
  gateway: string;
  rrr: string | null;
  status: string;
  paidAt: string | null;
  invoiceNumber: string | null;
  invoiceType: string | null;
  payerName: string | null;
  matricNumber: string | null;
};

const W = 595;
const H = 842;
const M = 44;
const INK = rgb(0, 0, 0);
const GRAY = rgb(0.35, 0.35, 0.35);
const LINE = rgb(0.6, 0.6, 0.6);

export async function buildFeeReceiptPdf(args: {
  receipt: ReceiptLike;
  inst: InstitutionSettings;
}): Promise<Uint8Array> {
  const { receipt: r, inst } = args;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([W, H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = H - M - 6;
  const text = (s: string, x: number, yy: number, size = 9.5, f = font, color = INK) =>
    page.drawText(s, { x, y: yy, size, font: f, color });

  const fmtMoney = (n: string | number) =>
    `NGN ${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
  const dash = (v: string | null | undefined) => (v && String(v).trim() ? String(v) : "—");

  /* ── Letterhead ─────────────────────────────────────────────── */
  const nameSize = inst.name.length > 44 ? 13 : 15;
  const nameText = inst.name.toUpperCase();
  const nameWidth = bold.widthOfTextAtSize(nameText, nameSize);
  text(nameText, (W - nameWidth) / 2, y, nameSize, bold);
  y -= 15;
  const subText = "Official Fee Payment Receipt";
  const subWidth = font.widthOfTextAtSize(subText, 9.5);
  text(subText, (W - subWidth) / 2, y, 9.5, font, GRAY);
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 2.4, color: INK });
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: INK });

  /* ── Meta strip ─────────────────────────────────────────────── */
  y -= 20;
  const metaCols: [string, string][] = [
    ["RECEIPT NO.", r.reference],
    ["INVOICE NO.", dash(r.invoiceNumber)],
    [
      "PAID ON",
      r.paidAt
        ? new Date(r.paidAt).toLocaleString("en-GB", {
            day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
          })
        : "—",
    ],
  ];
  const colW = (W - M * 2) / 3;
  metaCols.forEach(([label, value], i) => {
    const x = M + i * colW;
    text(label, x, y, 7, bold, GRAY);
    // Shrink to fit the column like the slip does.
    let size = 9.5;
    while (bold.widthOfTextAtSize(value, size) > colW - 14 && size > 6.5) size -= 0.4;
    text(value, x, y - 11, size, bold);
    page.drawLine({ start: { x, y: y - 15 }, end: { x: x + colW - 14, y: y - 15 }, thickness: 0.5, color: LINE });
  });
  y -= 34;

  /* ── Payment details grid ───────────────────────────────────── */
  const rows: [string, string][] = [
    ["PAYER", dash(r.payerName)],
    ["MATRIC NO.", dash(r.matricNumber)],
    ["FEE TYPE", (r.invoiceType ?? "").replace(/_/g, " ") || "SCHOOL FEES"],
    ["RRR", dash(r.rrr)],
    ["GATEWAY", dash(r.gateway)],
    ["STATUS", r.status],
    ["AMOUNT PAID", fmtMoney(r.amount)],
    ["AMOUNT IN WORDS", `${amountInWords(r.amount)} naira only`.toUpperCase()],
  ];
  const gap = 10;
  const cw = (W - M * 2 - gap) / 2;
  rows.forEach(([label, value], i) => {
    const col = i % 2;
    const x = M + col * (cw + gap);
    text(label, x, y, 6.8, bold, GRAY);
    let size = 9.5;
    while (bold.widthOfTextAtSize(value, size) > cw && size > 6.5) size -= 0.4;
    text(value, x, y - 11, size, bold);
    page.drawLine({ start: { x, y: y - 15 }, end: { x: x + cw, y: y - 15 }, thickness: 0.4, color: LINE });
    if (col === 1) y -= 26;
  });
  if (rows.length % 2 !== 0) y -= 26;

  /* ── Declaration box + QR ───────────────────────────────────── */
  y -= 10;
  const boxTop = y;
  const boxHeight = 58;
  page.drawRectangle({
    x: M, y: boxTop - boxHeight, width: W - M * 2, height: boxHeight,
    borderColor: INK, borderWidth: 0.9, color: rgb(0.98, 0.98, 0.98),
  });
  const decl =
    "This receipt is system-generated and valid without signature. Payments are confirmed only through the signed gateway webhook or by the Bursary; the printed amount reflects the verified transaction. Keep this receipt for your records.";
  let line1 = decl;
  let line2 = "";
  let line3 = "";
  const maxW = W - M * 2 - 80;
  while (bold.widthOfTextAtSize(line1, 8) > maxW) {
    const idx = line1.lastIndexOf(" ");
    line2 = line1.slice(idx) + line2;
    line1 = line1.slice(0, idx);
  }
  while (bold.widthOfTextAtSize(line2, 8) > maxW) {
    const idx = line2.lastIndexOf(" ");
    line3 = line2.slice(idx) + line3;
    line2 = line2.slice(0, idx);
  }
  text(line1, M + 10, boxTop - 14, 8, bold);
  text(line2.trim(), M + 10, boxTop - 25, 8, bold);
  text(line3.trim(), M + 10, boxTop - 36, 8, bold);
  try {
    const verifyUrl = `https://${inst.domain}/verify/receipt/${r.reference}`;
    const qrImage = await pdf.embedPng(await qrPng(verifyUrl));
    const qrSize = 54;
    page.drawImage(qrImage, { x: W - M - qrSize - 12, y: boxTop - boxHeight + 6, width: qrSize, height: qrSize });
  } catch {
    // QR is decorative; the receipt is valid without it.
  }
  y = boxTop - boxHeight - 8;

  /* ── Signature lines ────────────────────────────────────────── */
  y -= 34;
  const sigW = 200;
  page.drawLine({ start: { x: M, y }, end: { x: M + sigW, y }, thickness: 0.9, color: INK });
  page.drawLine({ start: { x: W - M - sigW, y }, end: { x: W - M, y }, thickness: 0.9, color: INK });
  text("Bursary", M, y - 11, 7.5, font, GRAY);
  text("Student", W - M - sigW, y - 11, 7.5, font, GRAY);

  /* ── Footer ─────────────────────────────────────────────────── */
  const footer = `Generated ${new Date().toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })} · Receipt No. ${r.reference}${r.rrr ? ` · Remita RRR ${r.rrr}` : ""}`;
  const fw = font.widthOfTextAtSize(footer, 7.5);
  text(footer, (W - fw) / 2, 36, 7.5, font, GRAY);

  return pdf.save();
}

/** Integer part to English words (mirrors the web receipt). */
export function amountInWords(amount: number): string {
  const n = Math.floor(Math.abs(Number(amount) || 0));
  if (n === 0) return "Zero";
  const ones = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const group = (num: number): string => {
    if (num === 0) return "";
    if (num < 20) return ones[num];
    if (num < 100) return `${tens[Math.floor(num / 10)]}${num % 10 ? "-" + ones[num % 10] : ""}`;
    return `${ones[Math.floor(num / 100)]} hundred${num % 100 ? " " + group(num % 100) : ""}`;
  };
  const scales: [number, string][] = [[1_000_000_000, "billion"], [1_000_000, "million"], [1_000, "thousand"]];
  const parts: string[] = [];
  let rest = n;
  for (const [value, name] of scales) {
    const count = Math.floor(rest / value);
    if (count > 0) {
      parts.push(`${group(count)} ${name}`);
      rest -= count * value;
    }
  }
  if (rest > 0) parts.push(group(rest));
  return parts.join(" ");
}
