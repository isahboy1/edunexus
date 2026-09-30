/**
 * EDUNEXUS lecturer e2e smoke test — the full results chain (SRS results workflow):
 *
 *   lecturer login → assigned-course roster → save CA/exam scores (DRAFT) →
 *   submit for approval (SUBMITTED) → HOD APPROVE → admin PUBLISH →
 *   PUBLISHED result + grade on the student transcript (+ notification) →
 *   reject path (HOD) → guards (RBAC, unassigned course, publish-before-approve)
 *
 * Uses the seeded demo data (DatabaseSeeder + DemoAccountsSeeder):
 *   lecturer@edunexus.edu.ng — LECTURER, assigned GSS 101 + EAP 101 (FIRST semester)
 *   student@edunexus.edu.ng  — STUDENT enrolled in both, transcript shows PUBLISHED rows
 *   hod@edunexus.edu.ng      — HOD (may APPROVE, forbidden to PUBLISH)
 *   academic@edunexus.edu.ng — ACADEMIC_OFFICER (may APPROVE and PUBLISH)
 *
 * Run: npm run smoke:lecturer   (or node scripts/smoke-lecturer.mjs [apiBaseUrl])
 *   NEXT_URL env overrides the Next server (default http://localhost:57362)
 */
const API = process.argv[2] ?? "http://127.0.0.1:8000/api/v1";

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

/** Laravel API client — stores the Sanctum bearer token (same shape as smoke.mjs). */
function client() {
  let token = "";
  return {
    get token() {
      return token;
    },
    set token(t) {
      token = t;
    },
    async req(method, path, { json, base = API } = {}) {
      const headers = { accept: "application/json" };
      if (token) headers.authorization = `Bearer ${token}`;
      let body;
      if (json !== undefined) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(json);
      }
      const res = await fetch(`${base}${path}`, { method, headers, body, redirect: "manual" });
      const ct = res.headers.get("content-type") ?? "";
      const payload = ct.includes("json") ? await res.json() : await res.text();
      return { status: res.status, payload };
    },
  };
}

const lecturer = client();
const hod = client();
const academic = client();
const student = client();
const admin = client();

async function login(c, email) {
  const res = await c.req("POST", "/auth/login", {
    json: { email, password: "Admin@12345" },
  });
  if (res.status !== 200 || !res.payload?.data?.token) {
    throw new Error(
      `login failed for ${email}: ${res.status} ${JSON.stringify(res.payload).slice(0, 120)} — reseed with: cd edunexus/api && php artisan db:seed`
    );
  }
  c.token = res.payload.data.token;
}

// ═══ [1] RBAC — the role gates and the lecturer profile ═══
console.log("\n[1] RBAC gates");
{
  await login(lecturer, "lecturer@edunexus.edu.ng");
  await login(hod, "hod@edunexus.edu.ng");
  await login(academic, "academic@edunexus.edu.ng");
  await login(student, "student@edunexus.edu.ng");
  await login(admin, "admin@edunexus.edu.ng");

  const noAuth = await fetch(`${API}/lecturer/courses`);
  check("roster requires auth", noAuth.status === 401, `status ${noAuth.status}`);

  const wrongRole = await student.req("GET", "/lecturer/courses");
  check("student token rejected on lecturer routes", wrongRole.status === 403, `status ${wrongRole.status}`);

  const roster = await lecturer.req("GET", "/lecturer/courses");
  check(
    "lecturer roster loads",
    roster.status === 200 && Array.isArray(roster.payload.data?.courses) && roster.payload.data.courses.length >= 1,
    `status ${roster.status}`
  );
}

// ═══ [2] Roster → save DRAFT scores ═══
console.log("\n[2] Roster & draft entry");
let gssCourseId = "";
let eapCourseId = "";
let rosterStudentId = "";
{
  const roster = await lecturer.req("GET", "/lecturer/courses");
  const courses = roster.payload.data?.courses ?? [];
  const gss = courses.find((c) => c.code === "GSS 101");
  const eap = courses.find((c) => c.code === "EAP 101");
  check("GSS 101 assigned", Boolean(gss), JSON.stringify(courses.map((c) => c.code)));
  check("EAP 101 assigned", Boolean(eap));
  check(
    "demo student enrolled in GSS 101",
    (gss?.enrolled ?? 0) >= 1 && Array.isArray(gss?.results) && gss.results.length >= 1
  );
  if (!gss || !gss.results?.[0]) {
    console.log("\nSeeded roster missing — reseed with: cd edunexus/api && php artisan db:seed");
    process.exit(1);
  }
  gssCourseId = gss.courseId;
  eapCourseId = eap?.courseId ?? "";
  rosterStudentId = gss.results[0].studentId;

  // Guard: a course the lecturer is not assigned to must be refused.
  const notAssigned = await lecturer.req(
    "POST",
    "/lecturer/courses/00000000-0000-0000-0000-000000000000/results",
    { json: { results: [{ studentId: rosterStudentId, ca: 20, exam: 30 }] } }
  );
  check("save refused for unassigned course", notAssigned.status === 403, `status ${notAssigned.status}`);

  // Validation: the exam component is capped at 60.
  const badScore = await lecturer.req("POST", `/lecturer/courses/${gssCourseId}/results`, {
    json: { results: [{ studentId: rosterStudentId, ca: 20, exam: 65 }] },
  });
  check("validation rejects exam score > 60", badScore.status === 422, `status ${badScore.status}`);

  const save = await lecturer.req("POST", `/lecturer/courses/${gssCourseId}/results`, {
    json: { results: [{ studentId: rosterStudentId, ca: 21, exam: 52 }] }, // total 73 → A
  });
  check(
    "draft scores saved",
    save.status === 200 && save.payload.data?.saved === 1,
    JSON.stringify(save.payload).slice(0, 120)
  );

  const after = await lecturer.req("GET", "/lecturer/courses");
  const gssAfter = (after.payload.data?.courses ?? []).find((c) => c.courseId === gssCourseId);
  const row = gssAfter?.results?.find((r) => r.studentId === rosterStudentId);
  check(
    "roster reflects saved draft scores",
    row?.status === "DRAFT" && Number(row?.ca) === 21 && Number(row?.exam) === 52,
    JSON.stringify(row)
  );
  check("grade computed server-side (73 → A)", row?.grade === "A", `grade ${row?.grade}`);
}

// ═══ [3] Submit → approve → publish ═══
console.log("\n[3] Approval chain");
let resultId = "";
{
  const submit = await lecturer.req("POST", `/lecturer/courses/${gssCourseId}/results/submit`);
  check(
    "submit locks the course results",
    submit.status === 200 && submit.payload.data?.submitted === 1,
    JSON.stringify(submit.payload).slice(0, 120)
  );

  const resubmit = await lecturer.req("POST", `/lecturer/courses/${gssCourseId}/results/submit`);
  check("re-submitting without drafts fails cleanly", resubmit.status === 422, `status ${resubmit.status}`);

  // Find the result row via the admin approval ledger.
  const ledger = await academic.req("GET", "/admin/results?status=SUBMITTED");
  const row = (ledger.payload.data?.data ?? ledger.payload.data ?? []).find(
    (r) => r.course?.id === gssCourseId && r.student?.id === rosterStudentId
  );
  check("submitted result appears in the approval ledger", Boolean(row), JSON.stringify(ledger.payload).slice(0, 120));
  resultId = row?.id ?? "";
  if (!resultId) {
    console.log("\nSubmitted result not found — cannot continue the chain.");
    process.exit(1);
  }

  // Publish-before-approve must fail.
  const earlyPublish = await academic.req("POST", `/admin/results/${resultId}/action`, {
    json: { action: "PUBLISH" },
  });
  check("publish before approve rejected", earlyPublish.status === 422, `status ${earlyPublish.status}`);

  const approve = await academic.req("POST", `/admin/results/${resultId}/action`, { json: { action: "APPROVE" } });
  check(
    "academic officer approves",
    approve.status === 200 && approve.payload.data?.status === "APPROVED",
    JSON.stringify(approve.payload).slice(0, 120)
  );

  const ledgerAfter = await academic.req("GET", "/admin/results?status=APPROVED");
  check(
    "approved result listed as APPROVED",
    (ledgerAfter.payload.data?.data ?? ledgerAfter.payload.data ?? []).some((r) => r.id === resultId)
  );
}

// ═══ [4] HOD approves; publish is above HOD's pay grade ═══
console.log("\n[4] HOD privileges");
{
  const hodRoster = await hod.req("GET", "/lecturer/courses");
  check("HOD token rejected on lecturer routes", hodRoster.status === 403, `status ${hodRoster.status}`);

  const hodApprove = await hod.req("POST", `/admin/results/${resultId}/action`, { json: { action: "APPROVE" } });
  check("re-approving an already-approved result is rejected", hodApprove.status === 422, `status ${hodApprove.status}`);

  const hodPublish = await hod.req("POST", `/admin/results/${resultId}/action`, { json: { action: "PUBLISH" } });
  check("HOD forbidden to publish", hodPublish.status === 403, `status ${hodPublish.status}`);
}

// ═══ [5] Publish → student sees the grade + notification ═══
console.log("\n[5] Publication & student visibility");
{
  const notifBefore = await student.req("GET", "/notifications").catch(() => null);
  const notifRows = (n) => (Array.isArray(n?.payload?.data?.notifications) ? n.payload.data.notifications : []);
  const publishedBefore = notifRows(notifBefore).filter((n) => String(n.subject ?? "").includes("Result published")).length;

  const publish = await academic.req("POST", `/admin/results/${resultId}/action`, { json: { action: "PUBLISH" } });
  check(
    "academic officer publishes",
    publish.status === 200 && publish.payload.data?.status === "PUBLISHED",
    JSON.stringify(publish.payload).slice(0, 120)
  );

  const transcript = await student.req("GET", "/student/transcript");
  const sessions = transcript.payload.data?.sessions ?? [];
  const rows = sessions.flatMap((s) => s.courses ?? []);
  const gssRow = rows.find((c) => c.code === "GSS 101");
  check(
    "published grade on student transcript",
    Boolean(gssRow) && gssRow.grade === "A" && Number(gssRow.ca) === 21 && Number(gssRow.exam) === 52,
    JSON.stringify(rows.map((c) => `${c.code}:${c.grade}`))
  );
  check("GPA computed on the transcript", typeof sessions[0]?.gpa === "number", JSON.stringify(sessions[0]?.gpa));

  const notifAfter = await student.req("GET", "/notifications").catch(() => null);
  const publishedAfter = notifRows(notifAfter).filter((n) => String(n.subject ?? "").includes("Result published")).length;
  if (notifBefore === null) {
    check("publication notification recorded (before/after probe)", publishedAfter > publishedBefore);
  } else {
    check("publication notification recorded", publishedAfter > publishedBefore, `${publishedBefore} → ${publishedAfter}`);
  }

  // Draft results must never leak onto the transcript.
  const draftVisible = rows.some((c) => c.code === "EAP 101");
  check("draft EAP 101 absent from transcript", !draftVisible);
}

// ═══ [6] Reject path & summary ═══
console.log("\n[6] Reject path");
if (eapCourseId) {
  // EAP 101 may hold a stale draft or a REJECTED row from a previous run —
  // re-save the draft first so the reject path is repeatable.
  const eapRoster = await lecturer.req("GET", "/lecturer/courses");
  const eapBefore = (eapRoster.payload.data?.courses ?? []).find((c) => c.courseId === eapCourseId);
  const eapStudentId = eapBefore?.results?.[0]?.studentId ?? rosterStudentId;
  await lecturer.req("POST", `/lecturer/courses/${eapCourseId}/results`, {
    json: { results: [{ studentId: eapStudentId, ca: 24, exam: 49 }] }, // 73 → C
  });
  const submitEap = await lecturer.req("POST", `/lecturer/courses/${eapCourseId}/results/submit`);
  if (submitEap.status === 200) {
    const ledger = await admin.req("GET", "/admin/results?status=SUBMITTED");
    const row = (ledger.payload.data?.data ?? ledger.payload.data ?? []).find(
      (r) => r.course?.id === eapCourseId && r.student?.id === rosterStudentId
    );
    if (row) {
      const reject = await admin.req("POST", `/admin/results/${row.id}/action`, { json: { action: "REJECT" } });
      check(
        "admin rejects a submitted result",
        reject.status === 200 && reject.payload.data?.status === "REJECTED",
        JSON.stringify(reject.payload).slice(0, 100)
      );
      const roster = await lecturer.req("GET", "/lecturer/courses");
      const eapAfter = (roster.payload.data?.courses ?? []).find((c) => c.courseId === eapCourseId);
      const eapRow = eapAfter?.results?.find((r) => r.studentId === rosterStudentId);
      check(
        "rejected result stays REJECTED until re-entry (roster excludes it)",
        eapRow === undefined || eapRow.status === "REJECTED",
        `status ${eapRow?.status}`
      );
    } else {
      check("EAP 101 submitted row found in ledger", false, "not in SUBMITTED ledger");
    }
  } else {
    check("EAP 101 draft submitted for rejection", false, JSON.stringify(submitEap.payload).slice(0, 100));
  }
} else {
  check("EAP 101 available for reject path", false, "EAP 101 not assigned — reseed");
}

const publishedReject = await academic.req("POST", `/admin/results/${resultId}/action`, { json: { action: "REJECT" } });
check("cannot reject a PUBLISHED result", publishedReject.status === 422, `status ${publishedReject.status}`);

// ═══ [7] Recovery loop: reject → re-enter → resubmit → approve → publish ═══
console.log("\n[7] Recovery loop (second-chance workflow)");
{
  // A PUBLISHED course result can still be re-opened by the lecturer: saving a
  // new draft resets the row to DRAFT (Result::updateOrCreate in the controller).
  const redraft = await lecturer.req("POST", `/lecturer/courses/${gssCourseId}/results`, {
    json: { results: [{ studentId: rosterStudentId, ca: 30, exam: 55 }] }, // 85 → A
  });
  check("lecturer re-opens a published course with a new draft", redraft.status === 200, `status ${redraft.status}`);

  const submit2 = await lecturer.req("POST", `/lecturer/courses/${gssCourseId}/results/submit`);
  check("revised scores submitted", submit2.status === 200 && submit2.payload.data?.submitted === 1, JSON.stringify(submit2.payload).slice(0, 100));

  const ledger2 = await admin.req("GET", "/admin/results?status=SUBMITTED");
  const row2 = (ledger2.payload.data?.data ?? ledger2.payload.data ?? []).find(
    (r) => r.course?.id === gssCourseId && r.student?.id === rosterStudentId
  );
  check("revised result awaits approval", Boolean(row2));

  if (row2) {
    const reject2 = await admin.req("POST", `/admin/results/${row2.id}/action`, { json: { action: "REJECT" } });
    check("admin rejects the revision", reject2.status === 200 && reject2.payload.data?.status === "REJECTED", `status ${reject2.status}`);

    // The rejected revision goes back to the lecturer, who corrects and resaves.
    const reenter = await lecturer.req("POST", `/lecturer/courses/${gssCourseId}/results`, {
      json: { results: [{ studentId: rosterStudentId, ca: 25, exam: 45 }] }, // 70 → A
    });
    check("lecturer re-enters scores after rejection", reenter.status === 200, `status ${reenter.status}`);

    const rosterAfter = await lecturer.req("GET", "/lecturer/courses");
    const gssAfter2 = (rosterAfter.payload.data?.courses ?? []).find((c) => c.courseId === gssCourseId);
    const rowAfter = gssAfter2?.results?.find((r) => r.studentId === rosterStudentId);
    check("re-entered scores sit in DRAFT again", rowAfter?.status === "DRAFT", `status ${rowAfter?.status}`);

    const resubmit = await lecturer.req("POST", `/lecturer/courses/${gssCourseId}/results/submit`);
    check("resubmit after correction", resubmit.status === 200 && resubmit.payload.data?.submitted === 1, JSON.stringify(resubmit.payload).slice(0, 100));

    const ledger3 = await admin.req("GET", "/admin/results?status=SUBMITTED");
    const row3 = (ledger3.payload.data?.data ?? ledger3.payload.data ?? []).find(
      (r) => r.course?.id === gssCourseId && r.student?.id === rosterStudentId
    );
    check("resubmitted row back in the ledger", Boolean(row3));

    if (row3) {
      const approve2 = await academic.req("POST", `/admin/results/${row3.id}/action`, { json: { action: "APPROVE" } });
      check("resubmitted result approved", approve2.status === 200 && approve2.payload.data?.status === "APPROVED", `status ${approve2.status}`);

      const publish2 = await academic.req("POST", `/admin/results/${row3.id}/action`, { json: { action: "PUBLISH" } });
      check("resubmitted result published", publish2.status === 200 && publish2.payload.data?.status === "PUBLISHED", `status ${publish2.status}`);

      const transcript = await student.req("GET", "/student/transcript");
      const gssFinal = (transcript.payload.data?.sessions ?? [])
        .flatMap((s) => s.courses ?? [])
        .find((c) => c.code === "GSS 101");
      check(
        "transcript reflects the corrected scores (25+45 → A)",
        gssFinal && Number(gssFinal.ca) === 25 && Number(gssFinal.exam) === 45 && gssFinal.grade === "A",
        JSON.stringify(gssFinal)
      );
    }
  }
}

console.log(`\n══════════════════════════════`);
console.log(`  RESULT: ${passed} passed, ${failed} failed`);
console.log(`══════════════════════════════`);
process.exitCode = failed > 0 ? 1 : 0;
