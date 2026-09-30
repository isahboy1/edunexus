import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { TOKEN_COOKIE, LARAVEL_API_URL } from "@/lib/laravel";

type Ctx = { params: Promise<{ id: string; docId: string }> };

/**
 * GET /api/v1/admin/applications/{id}/documents/{docId}
 *
 * Streams an application document from the Laravel private disk to an
 * authenticated officer's browser. Laravel enforces the role check and audits
 * every view (DOCUMENT_VIEWED); this proxy just attaches the Sanctum bearer
 * token from the httpOnly-side cookie so <iframe>/<img> tags can load it
 * without exposing the token to page JavaScript beyond what's needed.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id, docId } = await ctx.params;
  const store = await cookies();
  const token = store.get(TOKEN_COOKIE)?.value;
  if (!token) {
    return Response.json({ message: "Not signed in." }, { status: 401 });
  }

  const upstream = await fetch(
    `${LARAVEL_API_URL}/admin/applications/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}/download`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/pdf, image/jpeg, image/png, application/json",
      },
      cache: "no-store",
    }
  );

  if (!upstream.ok || !upstream.body) {
    const status = upstream.status === 403 || upstream.status === 404 ? upstream.status : 502;
    return Response.json({ message: `Unable to load document (${upstream.status}).` }, { status });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/octet-stream");
  const len = upstream.headers.get("Content-Length");
  if (len) headers.set("Content-Length", len);
  headers.set("Content-Disposition", upstream.headers.get("Content-Disposition") ?? "inline");
  headers.set("Cache-Control", "private, no-store");

  return new Response(upstream.body, { status: 200, headers });
}
