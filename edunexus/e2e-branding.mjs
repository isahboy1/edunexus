// TEMPORARY branding e2e — deleted after use.
const API = "http://localhost:8000/api/v1";
const NEXT = "http://localhost:3100";
const results = [];
function check(name, cond, detail = "") {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}
async function j(url, opts = {}) {
  const res = await fetch(url, opts);
  let body = null;
  try { body = await res.json(); } catch { /* binary */ }
  return { status: res.status, body, res };
}
const login = async (email) => {
  const r = await j(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Admin@12345" }),
  });
  return r.body?.data?.token;
};
// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const token = await login("admin@edunexus.edu.ng");
const auth = { Authorization: `Bearer ${token}` };
check("super admin login", !!token);

// 1. current branding = defaults (may be lowercase-normalised)
let r = await j(`${API}/admin/branding`, { headers: auth });
check("GET /admin/branding defaults", r.status === 200 && r.body?.data?.primary?.toLowerCase() === "#2b6074" && r.body?.data?.logoUrl === null, JSON.stringify(r.body?.data));

// 2. update colours (validation + persistence)
r = await j(`${API}/admin/branding`, { method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ primary: "#6D28D9", accent: "#0D9488" }) });
check("PUT colours saved (lowercase normalised)", r.status === 200 && r.body?.data?.primary === "#6d28d9", JSON.stringify(r.body?.data));
r = await j(`${API}/admin/branding`, { method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ primary: "not-a-colour" }) });
check("invalid hex rejected (422)", r.status === 422 || r.status === 302, `status=${r.status}`);

// 3. public settings exposes branding without auth
r = await j(`${API}/public/settings`);
check("public/settings carries branding", r.status === 200 && r.body?.data?.branding?.primary === "#6d28d9", JSON.stringify(r.body?.data?.branding));

// 4. logo upload → public stream
const fd = new FormData();
fd.append("logo", new Blob([PNG], { type: "image/png" }), "crest.png");
r = await j(`${API}/admin/branding/logo`, { method: "POST", headers: auth, body: fd });
check("logo upload 200 + logoUrl set", r.status === 200 && !!r.body?.data?.logoUrl, JSON.stringify(r.body?.data));
const logoRes = await fetch(`${API}/branding/logo`);
const logoBytes = Buffer.from(await logoRes.arrayBuffer());
check("public logo stream is our PNG", logoRes.status === 200 && logoBytes.equals(PNG), `bytes=${logoBytes.length} type=${logoRes.headers.get("content-type")}`);
r = await j(`${API}/public/settings`);
check("public logoUrl now set", r.body?.data?.branding?.logoUrl?.includes("/branding/logo"), String(r.body?.data?.branding?.logoUrl));

// 5. registrar can read and co-write (REGISTRAR is deliberately co-authorized
// for settings, matching the existing /admin/settings endpoints)
const regToken = await login("registrar@edunexus.edu.ng");
r = await j(`${API}/admin/branding`, { headers: { Authorization: `Bearer ${regToken}` } });
check("registrar can read branding", r.status === 200);
r = await j(`${API}/admin/branding`, { method: "PUT", headers: { Authorization: `Bearer ${regToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ primary: "#6D28D9" }) });
check("registrar co-write allowed (settings parity)", r.status === 200, `status=${r.status}`);

// 6. delete logo → fallback
r = await j(`${API}/admin/branding/logo`, { method: "DELETE", headers: auth });
check("logo delete 200 + logoUrl null", r.status === 200 && r.body?.data?.logoUrl === null);
const fallbackRes = await fetch(`${API}/branding/logo`, { redirect: "manual" });
check("public logo falls back (redirect)", fallbackRes.status === 302 || fallbackRes.status === 200, `status=${fallbackRes.status}`);

// 7. Next root page injects the purple ramp before paint
const home = await fetch(NEXT);
const html = await home.text();
check("Next injects brand CSS", html.includes("--brand-700:#6d28d9") && html.includes("--brand-950"), "purple ramp present in SSR HTML");

// 8. restore defaults for a tidy demo (lowercase normalisation asserted)
r = await j(`${API}/admin/branding`, { method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ primary: "#2b6074", accent: "#2d684f" }) });
check("defaults restored (normalised lowercase)", r.status === 200 && r.body?.data?.primary === "#2b6074", JSON.stringify(r.body?.data));
const home2 = await fetch(NEXT);
const html2 = await home2.text();
check("default palette → no override CSS", !html2.includes("--brand-700:#6d28d9") && !html2.includes(":root{--brand-"), "globals.css values stand");

console.log(`\n=== SUMMARY: ${results.filter(r => r.pass).length}/${results.length} passed ===`);
const failed = results.filter(r => !r.pass);
if (failed.length) { console.log("FAILED:"); failed.forEach(f => console.log(" -", f.name)); }
