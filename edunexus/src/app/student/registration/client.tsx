"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Alert, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatNaira } from "@/lib/format";
import { apiPut, apiPost } from "@/lib/laravel";
import type { EligibleCourse, RegistrationState } from "./page";

const MIN_UNITS = 12;
const MAX_UNITS = 24;

export function RegistrationClient({
  semester,
  courses,
  registration,
}: {
  semester: { id: string; name: string; status: string } | null;
  courses: EligibleCourse[];
  registration: RegistrationState;
}) {
  const initialSelected = useMemo(() => {
    if (!registration || registration.status !== "DRAFT") return new Set<string>();
    return new Set(registration.items.map((i) => i.courseId));
  }, [registration]);

  const [selected, setSelected] = useState<Set<string>>(initialSelected);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  // HTTP 402 from /registration/submit: outstanding school fees block submission.
  const [feeBlock, setFeeBlock] = useState<number | null>(null);

  const status = registration?.status ?? null;
  const editable = status === null || status === "DRAFT" || status === "REJECTED";

  const selectedCourses = courses.filter((c) => selected.has(c.id));
  const units = selectedCourses.reduce((sum, c) => sum + c.creditUnits, 0);

  function toggle(id: string) {
    if (!editable) return;
    setMsg(null);
    setFeeBlock(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setBusy("save");
    setMsg(null);
    const res = await apiPut("/student/registration", {
      courseIds: [...selected],
    });
    setBusy(null);
    if (res.ok) setMsg({ kind: "success", text: res.message || "Course selection saved." });
    else setMsg({ kind: "error", text: res.message || "Save failed." });
  }

  async function submit() {
    if (units < MIN_UNITS || units > MAX_UNITS) {
      setMsg({
        kind: "error",
        text: `Select between ${MIN_UNITS} and ${MAX_UNITS} credit units before submitting (currently ${units}).`,
      });
      return;
    }
    if (!window.confirm(`Submit ${selected.size} courses (${units} units) for HOD approval?`)) return;
    setBusy("submit");
    setMsg(null);
    // Save first, then lock it in.
    const saved = await apiPut("/student/registration", { courseIds: [...selected] });
    if (!saved.ok) {
      setBusy(null);
      setMsg({ kind: "error", text: saved.message || "Could not save the selection." });
      return;
    }
    const res = await apiPost("/student/registration/submit");
    setBusy(null);
    if (res.ok) {
      setFeeBlock(null);
      setMsg({ kind: "success", text: res.message || "Registration submitted for HOD approval." });
    } else if (res.status === 402) {
      // Fee clearance block — point the student straight at payment.
      const naira = res.message.match(/₦([\d,.]+)/);
      setFeeBlock(naira ? Number(naira[1].replace(/,/g, "")) : null);
      setMsg({
        kind: "error",
        text: res.message || "Outstanding fees must be settled before registration can be submitted.",
      });
    } else {
      setFeeBlock(null);
      setMsg({ kind: "error", text: res.message || "Submit failed." });
    }
  }

  return (
    <div className="mt-6">
      {semester ? (
        <p className="muted text-sm">
          Semester: <strong>{semester.name}</strong> — status{" "}
          <span className="font-semibold">{semester.status.replace(/_/g, " ")}</span>
        </p>
      ) : (
        <Alert kind="info">No active semester found.</Alert>
      )}

      {status && (
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm text-ink-600">Current registration:</span>
          <StatusBadge status={status} />
        </div>
      )}

      {msg && (
        <div className="mt-4">
          <Alert kind={msg.kind}>{msg.text}</Alert>
          {msg.kind === "error" && feeBlock !== null && (
            <Link href="/student/fees" className="btn-primary mt-3">
              <Icon name="wallet" className="h-4 w-4" />
              {feeBlock > 0 ? `Pay ${formatNaira(feeBlock)} now` : "Go to Fees & Payments"}
            </Link>
          )}
        </div>
      )}

      {status === "SUBMITTED" && (
        <div className="mt-4">
          <Alert kind="info">
            Your registration is awaiting HOD approval. You will be able to print the Course
            Registration Form once it is approved.
          </Alert>
        </div>
      )}
      {status === "HOD_APPROVED" && (
        <div className="mt-4">
          <Alert kind="info">
            Approved by your HOD — awaiting final approval by the Academic Office. Print forms are
            available once fully approved.
          </Alert>
        </div>
      )}
      {status === "APPROVED" && (
        <div className="mt-4">
          <Alert kind="success">
            Registration approved. You can print your forms from the Print Forms page.
          </Alert>
        </div>
      )}
      {status === "REJECTED" && (
        <div className="mt-4">
          <Alert kind="error">
            Your registration was rejected. Adjust your course selection and resubmit.
          </Alert>
        </div>
      )}

      <div className="mt-5 card-p">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Available Courses</h2>
          <span
            className={`text-sm font-semibold ${
              units < MIN_UNITS || units > MAX_UNITS ? "text-red-700" : "text-emerald-700"
            }`}
          >
            {units} / {MIN_UNITS}–{MAX_UNITS} credit units · {selected.size} course
            {selected.size === 1 ? "" : "s"}
          </span>
        </div>

        {courses.length === 0 ? (
          <div className="mt-3">
            <Alert kind="info">No courses are offered for your level this semester.</Alert>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {courses.map((c) => {
              const checked = selected.has(c.id);
              return (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!editable || (c.registered && !checked)}
                      onChange={() => toggle(c.id)}
                      className="h-4 w-4"
                    />
                    <span className="w-24 font-mono text-xs font-semibold">{c.code}</span>
                    <span className="flex-1">{c.title}</span>
                    <span className="badge-gray badge">{c.type}</span>
                    <span className="w-20 text-right font-semibold">{c.creditUnits} units</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {editable && (
          <div className="mt-5 flex gap-3">
            <button
              className="btn-outline"
              onClick={save}
              disabled={busy !== null || selected.size === 0}
            >
              {busy === "save" ? "Saving…" : "Save Selection"}
            </button>
            <button
              className="btn-primary"
              onClick={submit}
              disabled={busy !== null || selected.size === 0}
            >
              {busy === "submit" ? "Submitting…" : "Submit for Approval"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
