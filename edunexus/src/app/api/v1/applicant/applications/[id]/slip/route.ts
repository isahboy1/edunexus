import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { api, TOKEN_COOKIE } from "@/lib/laravel";
import { getInstitutionSettings } from "@/lib/settings";
import { formatEnum } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

type SlipApplication = {
  id: string;
  applicationNumber: string;
  applicationType: string;
  studyMode: string;
  status: string;
  paymentStatus: string;
  entryLevelValue: number | null;
  permanentAddress: string | null;
  currentAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  maritalStatus: string | null;
  religion: string | null;
  submittedAt: string | null;
  createdAt: string;
  applicant: {
    surname: string;
    firstName: string;
    middleName: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    nationality: string | null;
    stateOfOrigin: string | null;
    lga: string | null;
    address: string | null;
    user?: { email?: string | null; phone?: string | null } | null;
  } | null;
  programme: { name: string; code: string; award: string | null } | null;
  academicSession: { name: string } | null;
  jambResult: {
    registrationNumber: string;
    examinationYear: number;
    utmeScore: number | null;
    institutionChoice: string | null;
    subjects: { subject: string; score: number }[];
  } | null;
  olevelResults: {
    id: string;
    examinationType: string;
    examinationNumber: string;
    examinationYear: number;
    sittingNumber: number;
    subjects: { subject: string; grade: string }[];
  }[];
  qualifications: {
    id: string;
    qualification: string;
    institution: string;
    year: number;
    gradeClass: string | null;
  }[];
  payments: { reference: string; status: string; amount?: string | number; paidAt?: string | null }[];
  documents: { documentType: string; originalFileName: string; version: number; verificationStatus?: string | null }[];
};

// GET /api/v1/applicant/applications/{id}/slip — acknowledgement slip PDF.
// Reads the application from the Laravel API (Sanctum bearer) and renders
// the PDF locally from the returned JSON.
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const store = await cookies();
  const token = store.get(TOKEN_COOKIE)?.value;
  if (!token) {
    return Response.json({ message: "Not signed in." }, { status: 401 });
  }

  const res = await api<SlipApplication>(
    `/applicant/applications/${encodeURIComponent(id)}`,
    { token }
  );
  if (!res.ok || !res.data) {
    return Response.json(
      { message: res.message || "Application not found." },
      { status: res.status === 403 || res.status === 404 ? res.status : 404 }
    );
  }

  const application = res.data as SlipApplication;
  if (
    application.status === "DRAFT" ||
    application.status === "PAYMENT_PENDING" ||
    application.status === "PAID"
  ) {
    return Response.json(
      { message: "Slip is available after submission" },
      { status: 409 }
    );
  }

  const inst = await getInstitutionSettings();
  const { buildAcknowledgementSlipPdf } = await import("@/lib/pdf/slip");
  const bytes = await buildAcknowledgementSlipPdf({
    application: {
      ...application,
      submittedAt: application.submittedAt ? new Date(application.submittedAt) : null,
      createdAt: new Date(application.createdAt),
      applicant: application.applicant ?? {
        surname: "", firstName: "", middleName: null, dateOfBirth: null, gender: null,
        nationality: null, stateOfOrigin: null, lga: null, address: null, user: null,
      },
      programme: application.programme ?? { name: "", code: "", award: null },
      academicSession: application.academicSession ?? { name: "" },
      payments: application.payments ?? [],
      olevelResults: application.olevelResults ?? [],
      qualifications: application.qualifications ?? [],
      documents: application.documents ?? [],
    },
    inst,
    formatEnum,
  });
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="acknowledgement-${application.applicationNumber}.pdf"`,
    },
  });
}
