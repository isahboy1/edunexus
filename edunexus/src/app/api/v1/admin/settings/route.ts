import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handle, ok, fail } from "@/lib/api";
import { requireRole, recordAudit } from "@/lib/auth";
import { getInstitutionSettings, updateInstitutionSettings } from "@/lib/settings";

// GET /api/v1/admin/settings
export async function GET() {
  return handle(async () => {
    await requireRole("SUPER_ADMIN", "REGISTRAR");
    const [institution, sessions, windows] = await Promise.all([
      getInstitutionSettings(),
      prisma.academicSession.findMany({ orderBy: { startDate: "desc" } }),
      prisma.applicationSetting.findMany(),
    ]);
    return ok({
      institution,
      sessions,
      applicationWindows: windows.map((w) => ({
        academicSessionId: w.academicSessionId,
        applicationFee: Number(w.applicationFee),
        currency: w.currency,
        opensAt: w.opensAt,
        closesAt: w.closesAt,
        isActive: w.isActive,
        allowedTypes: w.allowedTypes,
      })),
    });
  });
}

// PATCH /api/v1/admin/settings — body: { institution?, window? }
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const staff = await requireRole("SUPER_ADMIN", "REGISTRAR");
    const body = (await req.json().catch(() => null)) as {
      institution?: Record<string, string>;
      window?: {
        academicSessionId: string;
        applicationFee?: number;
        currency?: string;
        opensAt?: string | null;
        closesAt?: string | null;
        isActive?: boolean;
        allowedTypes?: string[];
      };
    } | null;
    if (!body) return fail("Validation failed", 422, { form: ["Invalid request body"] });

    if (body.institution) {
      await updateInstitutionSettings(body.institution);
      await recordAudit({
        userId: staff.id,
        action: "SETTINGS_INSTITUTION_UPDATED",
        entityType: "SystemSetting",
        newValues: body.institution,
      });
    }

    if (body.window) {
      const w = body.window;
      if (!w.academicSessionId) {
        return fail("Validation failed", 422, { window: ["academicSessionId is required"] });
      }
      const data = {
        applicationFee: w.applicationFee !== undefined ? w.applicationFee : undefined,
        currency: w.currency,
        opensAt: w.opensAt ? new Date(w.opensAt) : null,
        closesAt: w.closesAt ? new Date(w.closesAt) : null,
        isActive: w.isActive,
        allowedTypes: w.allowedTypes ?? undefined,
      };
      await prisma.applicationSetting.upsert({
        where: { academicSessionId: w.academicSessionId },
        update: data,
        create: { academicSessionId: w.academicSessionId, applicationFee: w.applicationFee ?? 0 },
      });
      await recordAudit({
        userId: staff.id,
        action: "SETTINGS_ADMISSION_WINDOW_UPDATED",
        entityType: "ApplicationSetting",
        entityId: w.academicSessionId,
        newValues: body.window,
      });
    }

    return ok({ updated: true }, "Settings saved");
  });
}
