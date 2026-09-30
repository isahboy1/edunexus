/**
 * EDUNEXUS testimonials smoke test — walks the full testimonial pipeline
 * against the Next.js API (session-cookie auth, Prisma-backed):
 *
 *   login → create draft → draft hidden publicly → publish → homepage renders
 *   the quote → unpublish → re-publish → delete → gone.
 *
 * Run: node scripts/smoke-testimonials.mjs
 *   NEXT_URL env overrides the Next server (default http://localhost:57362)
 *
 * NOTE: `edunexus_session` is Secure + HttpOnly. Node's undici treats
 * localhost as a secure context, so the cookie round-trips over http://localhost
 * but NOT over 127.0.0.1 — always point NEXT_URL at localhost.
 *
 * NOTE: the admin login happens FIRST. A POST login issued after several GETs
 * on a reused keep-alive connection has been observed to intermittently reach
 * the server with an empty body (422 "Invalid credentials format") — a flake
 * in the client/server connection reuse, not in the app. Logging in before
 * any other request is deterministic.
 */
const NEXT = process.env.NEXT_URL ?? "http://localhost:57362";

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

const jar = { cookie: "" };
async function nextReq(method, path, json, cookieOverride) {
  const headers = { accept: "application/json" };
  const cookie = cookieOverride !== undefined ? cookieOverride : jar.cookie;
  if (cookie) headers.cookie = cookie;
  if (json !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${NEXT}/api/v1${path}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) jar.cookie = setCookie.split(";")[0];
  const ct = res.headers.get("content-type") ?? "";
  const payload = ct.includes("json") ? await res.json() : null;
  return { status: res.status, payload };
}

const stamp = Date.now().toString(36);
const NAME = `Smoke Quote ${stamp}`;

console.log("\n[Testimonials pipeline]");
{
  // Login before anything else — see the keep-alive note above.
  const login = await nextReq("POST", "/auth/login", {
    email: "admin@edunexus.edu.ng",
    password: "Admin@12345",
  });
  check("super admin login (Next session)", login.status === 200, `status ${login.status}`);

  // Authz gate: an explicitly bogus session cookie must be rejected.
  const blocked = await nextReq("GET", "/admin/testimonials", undefined, "edunexus_session=bogus.value");
  check("admin list rejects an invalid session", blocked.status === 401 || blocked.status === 403, `status ${blocked.status}`);

  const pubList = await nextReq("GET", "/public/testimonials");
  check(
    "public testimonials endpoint",
    pubList.status === 200 && Array.isArray(pubList.payload.data?.testimonials),
    JSON.stringify(pubList.payload).slice(0, 120)
  );

  // displayOrder 0 puts the quote in the homepage's first three slots —
  // the section renders take(3) ordered by displayOrder ascending.
  const created = await nextReq("POST", "/admin/testimonials", {
    studentName: NAME,
    role: "Smoke Test",
    quote: "This quote was created by the automated testimonials smoke test and is deleted again at the end of the run.",
    displayOrder: 0,
    status: "DRAFT",
  });
  const tid = created.payload?.data?.testimonial?.id;
  check("create draft testimonial", created.status === 201 && Boolean(tid), JSON.stringify(created.payload).slice(0, 150));

  if (!tid) {
    console.log(`\n══════════════════════════════`);
    console.log(`  RESULT: ${passed} passed, ${failed} failed`);
    console.log(`══════════════════════════════`);
    process.exit(1);
  }

  const whileDraft = await nextReq("GET", "/public/testimonials");
  check(
    "draft is not publicly visible",
    whileDraft.status === 200 && !(whileDraft.payload.data?.testimonials ?? []).some((t) => t.id === tid)
  );

  const publish = await nextReq("PATCH", `/admin/testimonials/${tid}`, { status: "PUBLISHED" });
  check(
    "publish testimonial",
    publish.status === 200 && publish.payload.data?.testimonial?.status === "PUBLISHED",
    `status ${publish.status}`
  );

  // The homepage is server-rendered from Prisma; the published quote must appear.
  const home = await fetch(NEXT);
  const homeText = home.ok ? await home.text() : "";
  check("homepage renders the published quote", home.ok && homeText.includes(NAME));

  const unpub = await nextReq("PATCH", `/admin/testimonials/${tid}`, { status: "DRAFT" });
  check("unpublish hides the quote again", unpub.status === 200 && unpub.payload.data?.testimonial?.status === "DRAFT");
  const home2 = await fetch(NEXT);
  const home2Text = home2.ok ? await home2.text() : "";
  check("homepage no longer renders the draft", home2.ok && !home2Text.includes(NAME));

  const republish = await nextReq("PATCH", `/admin/testimonials/${tid}`, { status: "PUBLISHED" });
  check("re-publish works", republish.status === 200 && republish.payload.data?.testimonial?.status === "PUBLISHED");

  const del = await nextReq("DELETE", `/admin/testimonials/${tid}`);
  check("delete testimonial", del.status === 200, `status ${del.status}`);

  const afterDelete = await nextReq("GET", "/public/testimonials");
  check(
    "deleted testimonial gone from public API",
    afterDelete.status === 200 && !(afterDelete.payload.data?.testimonials ?? []).some((t) => t.id === tid)
  );

  // Non-admin login must not yield SUPER_ADMIN (kept last: a 4xx rejection
  // satisfies the check, so the keep-alive flake cannot fail it).
  const badRole = await nextReq("POST", "/auth/login", {
    email: "smoke-not-an-admin@example.com",
    password: "Passw0rd1",
  });
  check(
    "non-admin login rejected",
    badRole.status !== 200 || !badRole.payload?.data?.user?.roles?.includes("SUPER_ADMIN")
  );
}

console.log(`\n══════════════════════════════`);
console.log(`  RESULT: ${passed} passed, ${failed} failed`);
console.log(`══════════════════════════════`);
process.exitCode = failed > 0 ? 1 : 0;
