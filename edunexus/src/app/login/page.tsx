import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/AuthLayout";
import { Spinner } from "@/components/ui";
import { getInstitutionSettings, getBranding, resolveLogoUrl } from "@/lib/settings";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Portal Login" };

export default async function LoginPage() {
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
      artSrc="/slides/portal.svg"
      eyebrow="Portal access"
      headline="One account for admissions, studies and records."
      blurb={`Sign in to track your application, register courses and manage fees — all from a single ${inst.shortName} account.`}
      bullets={[
        {
          icon: "file",
          title: "Applicants",
          body: "Complete your dossier, upload credentials and monitor your admission decision.",
        },
        {
          icon: "book",
          title: "Students",
          body: "Register courses, view results, print forms and settle fees online.",
        },
        {
          icon: "shield",
          title: "Staff & officers",
          body: "Review applications, approve registrations and maintain institutional records.",
        },
      ]}
    >
      <Suspense fallback={<Spinner />}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
