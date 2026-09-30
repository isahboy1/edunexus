import { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { clearSessionCookie, getSessionUser, recordAudit } from "@/lib/auth";

// POST /api/v1/auth/logout
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await getSessionUser();
    await clearSessionCookie();
    if (user) {
      await recordAudit({ userId: user.id, action: "LOGOUT", entityType: "User", entityId: user.id });
    }
    return ok({ loggedOut: true }, "Logged out successfully");
  });
}
