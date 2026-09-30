import type { Metadata } from "next";
import { AuthLayout } from "@/components/AuthLayout";
import { getInstitutionSettings, getBranding, resolveLogoUrl } from "@/lib/settings";
import RegisterForm from "./register-form";

export const metadata: Metadata = { title: "Create Applicant Account" };

export default async function RegisterPage() {
  const [inst, branding] = await Promise.all([
    getInstitutionSettings(),
    getBranding(),
  ]);

  return (
    <AuthLayout
      instName={inst.name}
      instShort={inst.shortName}
      logoUrl={resolveLogoUrl(branding)}
      address={inst.address}
      email={inst.email}
      phone={inst.phone}
      artSrc="/slides/admissions.svg"
      formWidth="lg"
      eyebrow="Admissions"
      headline="Begin your application in minutes."
      blurb="Create an account to start the online application — no queues, no paper forms, and you can track every stage of the process."
      bullets={[
        {
          icon: "clipboard",
          title: "Guided application form",
          body: "Personal, contact, programme and O-Level details in one structured flow.",
        },
        {
          icon: "layers",
          title: "Upload credentials safely",
          body: "Passport photograph, O-Level results and supporting documents.",
        },
        {
          icon: "receipt",
          title: "Pay your application fee",
          body: "Generate a Remita RRR and pay at any bank or online.",
        },
      ]}
    >
      <RegisterForm />
    </AuthLayout>
  );
}
