import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { api, TOKEN_COOKIE } from "@/lib/laravel";
import { getInstitutionSettings } from "@/lib/settings";
import { buildFeeReceiptPdf } from "@/lib/pdf/receipt";

type Ctx = { params: Promise<{ reference: string }> };

type ReceiptData = {
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

// GET /api/v1/payments/{reference}/receipt — fee receipt PDF. Reads the
// payment from the Laravel API (Sanctum bearer, ownership enforced server-
// side) and renders the PDF locally with pdf-lib.
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { reference } = await ctx.params;
  const store = await cookies();
  const token = store.get(TOKEN_COOKIE)?.value;
  if (!token) {
    return Response.json({ message: "Not signed in." }, { status: 401 });
  }

  const res = await api<ReceiptData>(`/payments/${encodeURIComponent(reference)}`, { token });
  if (!res.ok || !res.data) {
    return Response.json(
      { message: res.message || "Payment not found." },
      { status: res.status === 403 || res.status === 404 ? res.status : 404 }
    );
  }

  const receipt = res.data;
  if (receipt.status !== "SUCCESSFUL") {
    return Response.json(
      { message: "A receipt is available once the payment is confirmed." },
      { status: 409 }
    );
  }

  const inst = await getInstitutionSettings();
  const bytes = await buildFeeReceiptPdf({ receipt, inst });
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receipt-${receipt.reference}.pdf"`,
    },
  });
}
