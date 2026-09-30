/**
 * GET /api/v1/branding/logo — white-label logo proxy.
 *
 * Streams the institution's custom crest from the Laravel API (which stores
 * it outside the public folder) and falls back to the bundled /logo.png when
 * no custom logo is configured. One stable URL for headers, portals, the
 * browser tab icon and PDF letterheads.
 */
export async function GET() {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";

  try {
    const res = await fetch(`${base}/branding/logo`, { cache: "no-store" });

    // Laravel redirects to /logo.png when no custom logo is set — follow it
    // server-side so the client never sees a cross-origin redirect.
    if (res.ok && res.headers.get("content-type")?.startsWith("image/")) {
      const body = await res.arrayBuffer();
      return new Response(body, {
        headers: {
          "Content-Type": res.headers.get("content-type") ?? "image/png",
          "Cache-Control": "public, max-age=60",
        },
      });
    }
  } catch {
    // API unreachable — serve the bundled default below.
  }

  const png = await import("node:fs/promises").then((fs) =>
    fs.readFile(process.cwd() + "/public/logo.png")
  );
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=60" },
  });
}
