import { redirect } from "next/navigation";
import { getSessionUser, hasRole } from "@/lib/auth";
import { serverApi } from "@/lib/laravel-server";
import { PageHeader, Alert, SectionCard } from "@/components/ui";
import { SettingsForms } from "./forms";
import { BrandingForm } from "./branding-form";
import { DEFAULT_BRANDING } from "@/lib/branding";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Admin" };

type Window = {
  id: string;
  applicationFee: number;
  opensAt: string | null;
  closesAt: string | null;
  isActive: boolean;
  allowedTypes: string[] | null;
  academicSession: { id: string; name: string; isCurrent?: boolean };
};

export default async function AdminSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/settings");
  if (!hasRole(user, "SUPER_ADMIN", "REGISTRAR")) redirect("/admin/dashboard");

  const [res, brandingRes] = await Promise.all([
    serverApi<{
      system: Record<string, unknown>;
      admissionWindows: Window[];
    }>("/admin/settings"),
    serverApi<{ primary: string; accent: string; logoUrl: string | null }>("/admin/branding"),
  ]);

  const inst = (res.data?.system?.institution ?? null) as Record<string, string> | null;
  const windows = res.data?.admissionWindows ?? [];

  // Sessions are derived from the windows (each embeds its academic session).
  const sessions = windows
    .filter((w) => w.academicSession)
    .map((w) => ({
      id: w.academicSession.id,
      name: w.academicSession.name,
      isCurrent: Boolean(w.academicSession.isCurrent),
    }));

  const DEFAULT_INST = {
    name: "EduNexus College",
    shortName: "EduNexus",
    domain: "edunexus.edu.ng",
    address: "BUK Road, Kano, Kano State",
    email: "info@edunexus.edu.ng",
    phone: "+234 800 000 0000",
    matricPrefix: "EDU",
    admissionPrefix: "EDU/ADM",
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configuration"
        title="System Settings"
        description="Institution identity, academic sessions and admission windows — routine changes never require a developer."
        icon="sliders"
      />
      {!res.ok && <Alert kind="error">{res.message}</Alert>}

      <SectionCard
        title="Branding & Identity"
        subtitle="One institution per deployment — set the colours and crest every portal, public page and PDF uses."
        icon="sparkles"
      >
        <BrandingForm
          initial={{
            primary: brandingRes.data?.primary ?? DEFAULT_BRANDING.primary,
            accent: brandingRes.data?.accent ?? DEFAULT_BRANDING.accent,
            logoUrl: brandingRes.data?.logoUrl ?? null,
          }}
        />
      </SectionCard>

      <SettingsForms
        institution={{ ...DEFAULT_INST, ...(inst ?? {}) }}
        sessions={sessions}
        windows={windows.map((w) => ({
          id: w.id,
          academicSessionId: w.academicSession?.id ?? "",
          applicationFee: Number(w.applicationFee),
          opensAt: w.opensAt ? new Date(w.opensAt).toISOString().slice(0, 16) : "",
          closesAt: w.closesAt ? new Date(w.closesAt).toISOString().slice(0, 16) : "",
          isActive: w.isActive,
          allowedTypes: w.allowedTypes ?? [],
        }))}
      />
    </div>
  );
}
