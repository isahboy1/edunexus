"use client";

import { useState } from "react";
import { Alert, Field } from "@/components/ui";
import { api } from "@/lib/laravel";

interface Inst {
  name: string; shortName: string; domain: string; address: string;
  email: string; phone: string; matricPrefix: string; admissionPrefix: string;
}
interface Win {
  id: string;
  academicSessionId: string;
  applicationFee: number;
  opensAt: string;
  closesAt: string;
  isActive: boolean;
  allowedTypes: string[];
}

const TYPE_OPTIONS = [
  { value: "UTME", label: "UTME" },
  { value: "DIRECT_ENTRY", label: "Direct Entry" },
  { value: "PART_TIME", label: "Part-Time" },
  { value: "LONG_VACATION", label: "Long Vacation" },
  { value: "NCE", label: "NCE" },
  { value: "DIPLOMA", label: "Diploma" },
  { value: "OTHER", label: "Other" },
];

export function SettingsForms({
  institution,
  sessions,
  windows,
}: {
  institution: Inst;
  sessions: { id: string; name: string; isCurrent: boolean }[];
  windows: Win[];
}) {
  const [instMsg, setInstMsg] = useState<string | null>(null);
  const [winMsg, setWinMsg] = useState<string | null>(null);
  const [winErr, setWinErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveInstitution(fd: FormData) {
    setBusy(true);
    setInstMsg(null);
    // Laravel PUT /admin/settings takes a flat { settings: { key: value } } map;
    // the institution identity lives under the `institution` key.
    const res = await api("/admin/settings", {
      method: "PUT",
      body: { settings: { institution: Object.fromEntries(fd.entries()) } },
    });
    setInstMsg(res.ok ? "Institution settings saved." : res.message || "Save failed");
    setBusy(false);
  }

  async function saveWindow(fd: FormData) {
    setBusy(true);
    setWinErr(null);
    setWinMsg(null);
    const academicSessionId = String(fd.get("academicSessionId"));
    const existing = windows.find((w) => w.academicSessionId === academicSessionId);
    if (!existing) {
      setWinErr("No admission window configured for this session.");
      setBusy(false);
      return;
    }
    // Laravel PUT /admin/admission-windows/{id} — camelCase body.
    const body = {
      applicationFee: Number(fd.get("applicationFee") ?? 0),
      opensAt: String(fd.get("opensAt") || "") || null,
      closesAt: String(fd.get("closesAt") || "") || null,
      isActive: fd.get("isActive") === "on",
      allowedTypes: fd.getAll("allowedTypes").map(String),
    };
    const res = await api(`/admin/admission-windows/${existing.id}`, {
      method: "PUT",
      body,
    });
    if (res.ok) setWinMsg("Admission window saved.");
    else setWinErr(res.message || "Save failed");
    setBusy(false);
  }

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      {/* Institution identity */}
      <form
        className="card-p"
        action={async (fd) => { await saveInstitution(fd); }}
      >
        <h2 className="text-base font-bold">Institution Identity</h2>
        {instMsg && <div className="mt-3"><Alert kind="success">{instMsg}</Alert></div>}
        <div className="mt-4 grid gap-4">
          <Field label="Institution Name" name="name" required defaultValue={institution.name} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Short Name" name="shortName" required defaultValue={institution.shortName} />
            <Field label="Domain" name="domain" required defaultValue={institution.domain} />
          </div>
          <Field label="Address" name="address" required defaultValue={institution.address} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact Email" name="email" type="email" required defaultValue={institution.email} />
            <Field label="Contact Phone" name="phone" required defaultValue={institution.phone} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Matric Number Prefix" name="matricPrefix" required defaultValue={institution.matricPrefix} />
            <Field label="Admission Number Prefix" name="admissionPrefix" required defaultValue={institution.admissionPrefix} />
          </div>
        </div>
        <button className="btn-primary mt-5" type="submit" disabled={busy}>Save Institution Settings</button>
      </form>

      {/* Admission windows per session */}
      <div className="space-y-5">
        {sessions.map((s) => {
          const w = windows.find((x) => x.academicSessionId === s.id);
          return (
            <form key={s.id} className="card-p" action={async (fd) => { await saveWindow(fd); }}>
              <input type="hidden" name="academicSessionId" value={s.id} />
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Admission Window — {s.name} {s.isCurrent && <span className="badge-blue badge">Current</span>}</h2>
              </div>
              {winMsg && s.isCurrent && <div className="mt-3"><Alert kind="success">{winMsg}</Alert></div>}
              {winErr && s.isCurrent && <div className="mt-3"><Alert kind="error">{winErr}</Alert></div>}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Application Fee (₦)" name="applicationFee" type="number" min={0} required defaultValue={w?.applicationFee ?? 5500} />
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" name="isActive" defaultChecked={w?.isActive ?? false} />
                    Applications open
                  </label>
                </div>
                <Field label="Opens At" name="opensAt" type="datetime-local" defaultValue={w?.opensAt ?? ""} />
                <Field label="Closes At" name="closesAt" type="datetime-local" defaultValue={w?.closesAt ?? ""} />
              </div>
              <fieldset className="mt-4">
                <legend className="label">Allowed Application Types</legend>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {TYPE_OPTIONS.map((t) => (
                    <label key={t.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="allowedTypes"
                        value={t.value}
                        defaultChecked={w ? w.allowedTypes.length === 0 || w.allowedTypes.includes(t.value) : true}
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="btn-primary mt-5" type="submit" disabled={busy}>Save Window</button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
