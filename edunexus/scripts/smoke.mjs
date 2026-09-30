/**
 * EDUNEXUS end-to-end smoke test — walks the full admissions lifecycle:
 * register → apply → fill sections → upload docs → pay (signed webhook) →
 * submit → slip (Next PDF) → admin review → admit → accept → student.
 *
 * API checks hit the Laravel API directly (Sanctum bearer tokens).
 * A few checks hit the Next.js server for integration coverage:
 * homepage render, the signed mock-gateway webhook proxy, and the
 * acknowledgement-slip PDF route.
 *
 * Usage: node scripts/smoke.mjs [laravelApiBaseUrl]
 *   NEXT_URL env overrides the Next server (default http://localhost:57362)
 */
const API = process.argv[2] ?? "http://127.0.0.1:8000/api/v1";
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

/** Laravel API client — stores the Sanctum bearer token. */
function client() {
  let token = "";
  return {
    get token() {
      return token;
    },
    set token(t) {
      token = t;
    },
    async req(method, path, { json, form, base = API } = {}) {
      const headers = { accept: "application/json" };
      if (token) headers.authorization = `Bearer ${token}`;
      let body;
      if (json !== undefined) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(json);
      } else if (form !== undefined) {
        body = form; // fetch sets multipart Content-Type + boundary automatically
      }
      const res = await fetch(`${base}${path}`, { method, headers, body, redirect: "manual" });
      const ct = res.headers.get("content-type") ?? "";
      const payload = ct.includes("json") ? await res.json() : await res.text();
      return { status: res.status, payload };
    },
  };
}

const applicant = client();
const admin = client();

const stamp = Date.now().toString(36);
const phone = "080" + Date.now().toString().slice(-8); // unique per run (users.phone is unique)
let appId = "";
let reference = "";

// 1. Health & public site
console.log("\n[1] Public surface");
{
  const home = await fetch(NEXT);
  check("homepage renders (Next)", home.ok);

  const prog = await applicant.req("GET", "/programmes");
  check(
    "programmes API",
    prog.status === 200 && Array.isArray(prog.payload.data) && prog.payload.data.length > 0,
    JSON.stringify(prog.payload).slice(0, 120)
  );
  globalThis.__prog = prog.payload.data?.[0];

  const info = await applicant.req("GET", "/public/admission-info");
  check(
    "admission window configured with fee",
    info.status === 200 && typeof info.payload.data?.fee === "number" && info.payload.data.fee > 0,
    JSON.stringify(info.payload).slice(0, 120)
  );

  const pub = await applicant.req("GET", "/public/settings");
  check("public settings endpoint", pub.status === 200 && pub.payload.ok === true);
}

// 2. Applicant registration
console.log("\n[2] Applicant registration (FR-001)");
{
  const bad = await applicant.req("POST", "/auth/register", {
    json: { surname: "Test", firstName: "A", email: "not-an-email", phone: "080", password: "short", passwordConfirmation: "x" },
  });
  check(
    "validation rejects bad input",
    bad.status === 422 && Boolean(bad.payload?.errors),
    `status ${bad.status} ${JSON.stringify(bad.payload).slice(0, 120)}`
  );

  const dup = await applicant.req("POST", "/auth/register", {
    json: { surname: "Smoke", firstName: "Dup", email: "admin@edunexus.edu.ng", phone, password: "Passw0rd1", passwordConfirmation: "Passw0rd1" },
  });
  check("duplicate account prevented", dup.status === 422, `status ${dup.status}`);

  const reg = await applicant.req("POST", "/auth/register", {
    json: {
      surname: "Smoke", firstName: `Tester${stamp}`, middleName: "Q",
      email: `smoke${stamp}@example.com`, phone,
      password: "Passw0rd1", passwordConfirmation: "Passw0rd1",
    },
  });
  check("registration succeeds", reg.status === 201, JSON.stringify(reg.payload).slice(0, 120));

  const login = await applicant.req("POST", "/auth/login", {
    json: { email: `smoke${stamp}@example.com`, password: "Passw0rd1" },
  });
  applicant.token = login.payload?.data?.token ?? "";
  check("auto-login issues bearer token", login.status === 200 && Boolean(applicant.token), JSON.stringify(login.payload).slice(0, 120));

  const me = await applicant.req("GET", "/auth/me");
  check(
    "session carries APPLICANT role",
    me.status === 200 && Array.isArray(me.payload.data?.roles) && me.payload.data.roles.includes("APPLICANT")
  );
}

// 3. Application creation & sections
console.log("\n[3] Application lifecycle");
{
  const first = await applicant.req("POST", "/applicant/applications", {
    json: { programmeId: globalThis.__prog.id, applicationType: "UTME", studyMode: "FULL_TIME", entryLevelValue: 100 },
  });
  check("application created", first.status === 201, JSON.stringify(first.payload).slice(0, 150));
  appId = first.payload.data?.id ?? "";
  check(
    "application number assigned",
    /^EDU\/\d{4}\/\d{5}-\d+$/.test(first.payload.data?.application_number ?? ""),
    `got ${first.payload.data?.application_number}`
  );

  const second = await applicant.req("POST", "/applicant/applications", {
    json: { programmeId: globalThis.__prog.id, applicationType: "UTME", studyMode: "FULL_TIME" },
  });
  check("second application blocked (one per session)", second.status === 422, `status ${second.status}`);

  const beforePay = await applicant.req("POST", `/applicant/applications/${appId}/submit`);
  check(
    "submit blocked before payment (readiness gate)",
    beforePay.status === 422 && Array.isArray(beforePay.payload?.data?.problems) && beforePay.payload.data.problems.length > 0,
    `status ${beforePay.status} ${JSON.stringify(beforePay.payload).slice(0, 150)}`
  );

  // Sections (nested Laravel payloads — no `section` key)
  const p = await applicant.req("PATCH", `/applicant/applications/${appId}`, {
    json: {
      personal: {
        surname: "Smoke", firstName: `Tester${stamp}`, dateOfBirth: "2004-05-10",
        gender: "MALE", maritalStatus: "SINGLE", nationality: "Nigerian",
        stateOfOrigin: "Kano", lga: "Nassarawa", phone,
        address: "12 Zoo Road, Kano",
      },
    },
  });
  check("personal info saved", p.status === 200, JSON.stringify(p.payload).slice(0, 150));

  const c = await applicant.req("PATCH", `/applicant/applications/${appId}`, {
    json: {
      contact: {
        permanentAddress: "12 Zoo Road, Kano", currentAddress: "12 Zoo Road, Kano",
        emergencyContactName: "Parent Smoke", emergencyContactPhone: "08087654321",
      },
    },
  });
  check("contact info saved", c.status === 200, JSON.stringify(c.payload).slice(0, 150));

  const j = await applicant.req("PATCH", `/applicant/applications/${appId}`, {
    json: {
      jamb: {
        registrationNumber: `SMOKE${stamp}`.toUpperCase().slice(0, 12),
        examinationYear: 2026, utmeScore: 245, institutionChoice: "EDUNEXUS",
        subjects: [{ subject: "English", score: 65 }, { subject: "Maths", score: 70 }],
      },
    },
  });
  check("JAMB info saved", j.status === 200, JSON.stringify(j.payload).slice(0, 150));

  const o = await applicant.req("PATCH", `/applicant/applications/${appId}`, {
    json: {
      olevel: {
        examinationType: "WAEC", examinationNumber: `WAEC${stamp}`.slice(0, 12),
        examinationYear: 2023, sittingNumber: 1,
        subjects: [
          { subject: "English Language", grade: "C4" }, { subject: "Mathematics", grade: "B3" },
          { subject: "Physics", grade: "C5" }, { subject: "Chemistry", grade: "C6" },
          { subject: "Biology", grade: "B3" },
        ],
      },
    },
  });
  check("O-Level info saved", o.status === 200, JSON.stringify(o.payload).slice(0, 150));
}

// 4. Documents
console.log("\n[4] Document uploads");
{
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  for (const type of ["PASSPORT", "OLEVEL_RESULT"]) {
    const fd = new FormData();
    fd.set("documentType", type);
    fd.set("document", new Blob([png], { type: "image/png" }), `${type.toLowerCase()}.png`);
    const up = await applicant.req("POST", `/applicant/applications/${appId}/documents`, { form: fd });
    check(`${type} uploaded`, up.status === 201, JSON.stringify(up.payload).slice(0, 120));
  }
  const badFd = new FormData();
  badFd.set("documentType", "PASSPORT");
  badFd.set("document", new Blob([Buffer.from("GIF89a")], { type: "image/gif" }), "x.gif");
  const badUp = await applicant.req("POST", `/applicant/applications/${appId}/documents`, { form: badFd });
  check("disallowed MIME rejected", badUp.status === 422, `status ${badUp.status}`);
}

// 5. Payment
console.log("\n[5] Payment flow (server-side verification only)");
{
  const init = await applicant.req("POST", `/applicant/applications/${appId}/payments`);
  check("payment initialized", init.status === 201, JSON.stringify(init.payload).slice(0, 150));
  reference = init.payload.data?.reference ?? "";
  check("reference issued", /^APP-[A-Z0-9]{14}$/.test(reference), `got ${reference}`);
  check(
    "checkout URL issued",
    typeof init.payload.data?.gateway_response?.checkout_url === "string",
    JSON.stringify(init.payload.data?.gateway_response ?? null).slice(0, 150)
  );

  const dupInit = await applicant.req("POST", `/applicant/applications/${appId}/payments`);
  check(
    "double payment init reuses in-flight payment",
    dupInit.status === 200 && dupInit.payload.data?.reference === reference,
    `status ${dupInit.status} ${JSON.stringify(dupInit.payload).slice(0, 120)}`
  );

  const unsigned = await fetch(`${API}/payments/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "charge.success", reference, status: "SUCCESSFUL" }),
  });
  check("unsigned webhook rejected", unsigned.status === 401, `status ${unsigned.status}`);

  const forged = await fetch(`${API}/payments/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-edunexus-signature": "deadbeef".repeat(16) },
    body: JSON.stringify({ event: "charge.success", reference, status: "SUCCESSFUL" }),
  });
  check("forged signature rejected", forged.status === 401, `status ${forged.status}`);

  // Browser cannot sign, so the Next dev proxy signs server-side (integration check).
  const signed = await fetch(`${NEXT}/api/mock-gateway-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ outcome: "success", payload: { event: "charge.success", reference } }),
  });
  const sj = await signed.json();
  check("signed webhook verified payment", signed.ok && sj.gatewayStatus === "SUCCESSFUL", JSON.stringify(sj));

  const verify = await applicant.req("GET", `/payments/${reference}`);
  check(
    "server-side verification reads SUCCESSFUL",
    verify.status === 200 && verify.payload.data?.status === "SUCCESSFUL",
    JSON.stringify(verify.payload).slice(0, 150)
  );

  const app = await applicant.req("GET", `/applicant/applications/${appId}`);
  check("application auto-moved to PAID", app.payload.data?.status === "PAID", `status ${app.payload.data?.status}`);
  check("payment_status SUCCESSFUL", app.payload.data?.payment_status === "SUCCESSFUL", `got ${app.payload.data?.payment_status}`);
}

// 6. Submission & slip
console.log("\n[6] Submission & acknowledgement slip");
{
  const sub = await applicant.req("POST", `/applicant/applications/${appId}/submit`);
  check("application submitted", sub.status === 200 && sub.payload.data?.status === "SUBMITTED", JSON.stringify(sub.payload).slice(0, 150));

  const resub = await applicant.req("POST", `/applicant/applications/${appId}/submit`);
  check("double submit blocked", resub.status === 422, `status ${resub.status}`);

  const edit = await applicant.req("PATCH", `/applicant/applications/${appId}`, {
    json: { contact: { permanentAddress: "x", currentAddress: "x" } },
  });
  check("submitted application locked", edit.status === 422, `status ${edit.status}`);

  // Completeness endpoint — submitted application should be fully ready.
  const comp = await applicant.req("GET", `/applicant/applications/${appId}/completeness`);
  const compData = comp.payload.data ?? {};
  check(
    "completeness reports ready after submit",
    comp.status === 200 && compData.ready === true && Array.isArray(compData.sections) && compData.sections.length >= 7,
    JSON.stringify(comp.payload).slice(0, 150)
  );

  // Next route renders the PDF from Laravel JSON (needs the edunexus_token cookie).
  const slipRes = await fetch(`${NEXT}/api/v1/applicant/applications/${appId}/slip`, {
    headers: { cookie: `edunexus_token=${applicant.token}` },
  });
  const slipBytes = Buffer.from(await slipRes.arrayBuffer());
  const head = slipBytes.subarray(0, 5).toString("latin1");
  check(
    "acknowledgement slip PDF generated (Next)",
    slipRes.ok && head === "%PDF-",
    `status ${slipRes.status}, head ${JSON.stringify(head)}`
  );
  // Section-layout slip: multi-section PDF should be larger than the old
  // one-page summary (~2KB); decompressed streams would say more, but a
  // size floor catches a regression to the bare-bones layout.
  check(
    "slip PDF has section layout (size floor)",
    slipBytes.length > 2500,
    `${slipBytes.length} bytes`
  );
}

// 7. Admin review
console.log("\n[7] Admin review & admission");
{
  const blocked = await applicant.req("GET", "/admin/applications");
  check("admin API blocked for applicant", blocked.status === 403, `status ${blocked.status}`);

  const login = await admin.req("POST", "/auth/login", {
    json: { email: "admissions@edunexus.edu.ng", password: "Admin@12345" },
  });
  admin.token = login.payload?.data?.token ?? "";
  check("admissions officer login", login.status === 200 && Boolean(admin.token));

  const list = await admin.req("GET", "/admin/applications?status=SUBMITTED");
  check(
    "queue lists submitted application",
    list.status === 200 && Array.isArray(list.payload.data?.data) && list.payload.data.data.length > 0,
    JSON.stringify(list.payload).slice(0, 150)
  );

  // Readiness filter — the freshly submitted app must NOT appear as incomplete.
  const incomplete = await admin.req("GET", "/admin/applications?readiness=incomplete");
  const incompleteIds = (incomplete.payload.data?.data ?? []).map((r) => r.id);
  check(
    "readiness filter excludes complete application",
    incomplete.status === 200 && !incompleteIds.includes(appId),
    `status ${incomplete.status}`
  );

  const review = await admin.req("POST", `/admin/applications/${appId}/actions`, {
    json: { action: "REVIEW", comments: "Credentials look good" },
  });
  check("review action", review.status === 200 && review.payload.data?.status === "UNDER_REVIEW", JSON.stringify(review.payload).slice(0, 150));

  const shortlist = await admin.req("POST", `/admin/applications/${appId}/actions`, {
    json: { action: "SHORTLIST" },
  });
  check("shortlist action", shortlist.status === 200 && shortlist.payload.data?.status === "SHORTLISTED", JSON.stringify(shortlist.payload).slice(0, 150));

  const badAction = await admin.req("POST", `/admin/applications/${appId}/actions`, {
    json: { action: "review" },
  });
  check("lowercase action rejected", badAction.status === 422, `status ${badAction.status}`);

  // Officer document verification (needs the dossier document ids)
  const dossier = await admin.req("GET", `/admin/applications/${appId}`);

  // Admin completeness mirror (same engine as the applicant wizard).
  const acomp = await admin.req("GET", `/admin/applications/${appId}/completeness`);
  check(
    "admin completeness endpoint",
    acomp.status === 200 && acomp.payload.data?.ready === true && Array.isArray(acomp.payload.data?.sections),
    JSON.stringify(acomp.payload).slice(0, 120)
  );

  const docs = dossier.payload.data?.documents ?? [];
  const passport = docs.find((d) => d.document_type === "PASSPORT");
  const olevel = docs.find((d) => d.document_type === "OLEVEL_RESULT");
  check("dossier exposes documents", passport && olevel, JSON.stringify(docs).slice(0, 120));

  const vPass = await admin.req("POST", `/admin/applications/${appId}/documents/${passport?.id}/verify`, {
    json: { decision: "VERIFIED", note: "Matches application data" },
  });
  check(
    "passport document verified",
    vPass.status === 200 && vPass.payload.data?.verification_status === "VERIFIED",
    JSON.stringify(vPass.payload).slice(0, 150)
  );

  const vOlevel = await admin.req("POST", `/admin/applications/${appId}/documents/${olevel?.id}/verify`, {
    json: { decision: "REJECTED", note: "Blurry scan — re-upload requested" },
  });
  check(
    "olevel document rejected",
    vOlevel.status === 200 && vOlevel.payload.data?.verification_status === "REJECTED",
    JSON.stringify(vOlevel.payload).slice(0, 150)
  );

  const vBad = await admin.req("POST", `/admin/applications/${appId}/documents/${passport?.id}/verify`, {
    json: { decision: "MAYBE" },
  });
  check("invalid verify decision rejected", vBad.status === 422, `status ${vBad.status}`);

  const admit = await admin.req("POST", `/admin/applications/${appId}/actions`, {
    json: { action: "ADMIT", comments: "Subject to verification of results" },
  });
  check("admit action creates admission", admit.status === 200, JSON.stringify(admit.payload).slice(0, 150));
  check(
    "admission number format",
    /^ADM\/\d{4}\/\d{5}$/.test(admit.payload.data?.admission_number ?? ""),
    `got ${admit.payload.data?.admission_number}`
  );

  const stats = await admin.req("GET", "/admin/stats");
  check(
    "admin stats",
    stats.status === 200 && stats.payload.data?.applications?.admitted >= 1,
    JSON.stringify(stats.payload).slice(0, 150)
  );

  // Bulk admit: create a second applicant end-to-end so the check is hermetic,
  // drive it to SHORTLISTED, then batch it together with the already-admitted
  // first application to exercise the per-row skip path.
  const second = client();
  const stamp2 = stamp + "b";
  const phone2 = "081" + Date.now().toString().slice(-8);
  const reg2 = await second.req("POST", "/auth/register", {
    json: {
      surname: "Smoke", firstName: `Bulk${stamp2}`, email: `smoke${stamp2}@example.com`,
      phone: phone2, password: "Passw0rd1", passwordConfirmation: "Passw0rd1",
    },
  });
  check("bulk applicant registered", reg2.status === 201, JSON.stringify(reg2.payload).slice(0, 120));
  const login2 = await second.req("POST", "/auth/login", { json: { email: `smoke${stamp2}@example.com`, password: "Passw0rd1" } });
  second.token = login2.payload?.data?.token ?? "";

  if (second.token) {
    const app2 = await second.req("POST", "/applicant/applications", {
      json: { programmeId: globalThis.__prog.id, applicationType: "UTME", studyMode: "FULL_TIME" },
    });
    const appId2 = app2.payload.data?.id ?? "";
    const png2 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    for (const type of ["PASSPORT", "OLEVEL_RESULT"]) {
      const fd = new FormData();
      fd.set("documentType", type);
      fd.set("document", new Blob([png2], { type: "image/png" }), `${type.toLowerCase()}.png`);
      await second.req("POST", `/applicant/applications/${appId2}/documents`, { form: fd });
    }
    const personal2 = await second.req("PATCH", `/applicant/applications/${appId2}`, {
      json: {
        personal: {
          surname: "Smoke", firstName: `Bulk${stamp2}`, dateOfBirth: "2004-05-10",
          gender: "MALE", maritalStatus: "SINGLE", nationality: "Nigerian",
          stateOfOrigin: "Kano", lga: "Nassarawa", phone: phone2,
          address: "12 Zoo Road, Kano",
        },
      },
    });
    check("bulk personal saved", personal2.status === 200, `status ${personal2.status} ${JSON.stringify(personal2.payload).slice(0, 120)}`);
    const contact2 = await second.req("PATCH", `/applicant/applications/${appId2}`, {
      json: {
        contact: {
          permanentAddress: "12 Zoo Road, Kano", currentAddress: "12 Zoo Road, Kano",
          emergencyContactName: "Parent Bulk", emergencyContactPhone: "08087654322",
        },
      },
    });
    check("bulk contact saved", contact2.status === 200, `status ${contact2.status} ${JSON.stringify(contact2.payload).slice(0, 120)}`);
    const jamb2 = await second.req("PATCH", `/applicant/applications/${appId2}`, {
      json: {
        jamb: {
          registrationNumber: `SMOKE${stamp2}`.toUpperCase().slice(0, 12),
          examinationYear: 2026, utmeScore: 245, institutionChoice: "EDUNEXUS",
          subjects: [{ subject: "English", score: 65 }, { subject: "Maths", score: 70 }],
        },
      },
    });
    check("bulk jamb saved", jamb2.status === 200, `status ${jamb2.status} ${JSON.stringify(jamb2.payload).slice(0, 120)}`);
    const olevel2 = await second.req("PATCH", `/applicant/applications/${appId2}`, {
      json: {
        olevel: {
          examinationType: "WAEC", examinationNumber: `WAE${stamp2}`.slice(0, 12),
          examinationYear: 2023, sittingNumber: 1,
          subjects: [
            { subject: "English Language", grade: "C4" }, { subject: "Mathematics", grade: "B3" },
            { subject: "Physics", grade: "C5" }, { subject: "Chemistry", grade: "C6" },
            { subject: "Biology", grade: "B3" },
          ],
        },
      },
    });
    check("bulk olevel saved", olevel2.status === 200, `status ${olevel2.status} ${JSON.stringify(olevel2.payload).slice(0, 120)}`);
    const init2 = await second.req("POST", `/applicant/applications/${appId2}/payments`);
    const ref2 = init2.payload.data?.reference ?? "";
    await fetch(`${NEXT}/api/mock-gateway-webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome: "success", payload: { event: "charge.success", reference: ref2 } }),
    });
    const sub2 = await second.req("POST", `/applicant/applications/${appId2}/submit`);
    check("bulk application submitted", sub2.status === 200, JSON.stringify(sub2.payload).slice(0, 150));

    for (const step of ["REVIEW", "SHORTLIST"]) {
      await admin.req("POST", `/admin/applications/${appId2}/actions`, { json: { action: step } });
    }
    const bulk = await admin.req("POST", "/admin/applications/bulk-admit", {
      json: { applicationIds: [appId2, appId], comments: "Batch offer" },
    });
    const bulkData = bulk.payload.data ?? {};
    check(
      "bulk admit admits + skips",
      bulk.status === 200 &&
        Array.isArray(bulkData.admitted) && bulkData.admitted.length === 1 &&
        Array.isArray(bulkData.skipped) && bulkData.skipped.length === 1,
      JSON.stringify(bulk.payload).slice(0, 200)
    );

    const emptyBulk = await admin.req("POST", "/admin/applications/bulk-admit", { json: { applicationIds: [] } });
    check("empty bulk payload rejected", emptyBulk.status === 422, `status ${emptyBulk.status}`);
  }
}

// 8. Acceptance & student conversion
console.log("\n[8] Admission acceptance → student");
{
  const statusRes = await applicant.req("GET", "/applicant/admission-status");
  const entries = Array.isArray(statusRes.payload.data) ? statusRes.payload.data : [];
  const entry = entries.find((e) => e.admission);
  check("admission visible to applicant", Boolean(entry?.admission), JSON.stringify(statusRes.payload).slice(0, 150));
  if (!entry) {
    console.log(`\n══════════════════════════════`);
    console.log(`  RESULT: ${passed} passed, ${failed} failed`);
    console.log(`══════════════════════════════`);
    process.exit(1);
  }

  const accept = await applicant.req("POST", `/applicant/admissions/${entry.admission.id}/accept`);
  check("acceptance converts to student", accept.status === 200, JSON.stringify(accept.payload).slice(0, 150));
  check(
    "matric number issued",
    /^EDU\/\d{4}\/\d{5}$/.test(accept.payload.data?.student?.matric_number ?? ""),
    `got ${accept.payload.data?.student?.matric_number}`
  );

  const again = await applicant.req("POST", `/applicant/admissions/${entry.admission.id}/accept`);
  check(
    "duplicate accept is idempotent",
    again.status === 200 && again.payload.data?.student?.id === accept.payload.data?.student?.id,
    `status ${again.status}`
  );

  const me = await applicant.req("GET", "/auth/me");
  check(
    "session upgraded with STUDENT role",
    me.status === 200 && Array.isArray(me.payload.data?.roles) && me.payload.data.roles.includes("STUDENT"),
    JSON.stringify(me.payload.data?.roles)
  );
}

console.log(`
══════════════════════════════`);
console.log(`  RESULT: ${passed} passed, ${failed} failed`);
console.log(`══════════════════════════════`);
process.exit(failed > 0 ? 1 : 0);
