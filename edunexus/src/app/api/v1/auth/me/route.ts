import { handle, ok } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";

// GET /api/v1/auth/me
export async function GET() {
  return handle(async () => {
    const user = await getSessionUser();
    return ok({ user });
  });
}
