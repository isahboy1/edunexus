"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost } from "@/lib/laravel";
import { formatNaira } from "@/lib/format";
import { Icon } from "@/components/icons";
import { StatusBadge } from "@/components/ui";

type Structure = {
  id: string;
  session: string | null;
  programme: string | null;
  programmeCode: string | null;
  levelValue: number;
  studentType: string;
  isActive: boolean;
  total: number;
  itemCount: number;
};

export function FeesClient({
  structures,
  canManage,
  sessions,
  programmes,
  levels,
}: {
  structures: Structure[];
  canManage: boolean;
  sessions: { value: string; label: string }[];
  programmes: { value: string; label: string }[];
  levels: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemRows, setItemRows] = useState(3);

  async function submitCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const items = Array.from({ length: itemRows }, (_, i) => ({
      name: String(fd.get(`itemName${i}`) ?? ""),
      amount: Number(fd.get(`itemAmount${i}`) ?? 0),
      category: String(fd.get(`itemCategory${i}`) ?? "OTHER"),
    })).filter((i) => i.name && i.amount > 0);

    if (items.length === 0) {
      setError("Add at least one fee item with a name and amount.");
      setBusy(false);
      return;
    }

    try {
      const res = await apiPost("/admin/fees", {
        academicSessionId: String(fd.get("academicSessionId") ?? ""),
        programmeId: String(fd.get("programmeId") ?? ""),
        levelValue: Number(fd.get("levelValue") ?? 0),
        studentType: String(fd.get("studentType") ?? "FRESH"),
        items,
      });
      if (!res.ok) {
        setError(res.message || "Could not create the fee structure.");
        return;
      }
      setShowForm(false);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    setBusy(true);
    try {
      await apiPatch(`/admin/fees/${id}`, { isActive });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[#fcfdfb] px-5 py-3.5">
        <p className="text-xs text-ink-600">Showing {structures.length} most recent structures</p>
        {canManage && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
            <Icon name={showForm ? "x" : "wallet"} className="h-3.5 w-3.5" />
            {showForm ? "Close" : "New structure"}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={submitCreate} className="space-y-4 border-b border-[var(--line)] bg-[#fbfcfa] px-5 py-5" aria-label="Create fee structure">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="academicSessionId" className="label">Session <span className="text-red-500">*</span></label>
              <select id="academicSessionId" name="academicSessionId" required className="input mt-1" defaultValue="">
                <option value="" disabled>Select…</option>
                {sessions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="programmeId" className="label">Programme <span className="text-red-500">*</span></label>
              <select id="programmeId" name="programmeId" required className="input mt-1" defaultValue="">
                <option value="" disabled>Select…</option>
                {programmes.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="levelValue" className="label">Level <span className="text-red-500">*</span></label>
              <select id="levelValue" name="levelValue" required className="input mt-1" defaultValue="">
                <option value="" disabled>Select…</option>
                {levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="studentType" className="label">Student type</label>
              <select id="studentType" name="studentType" className="input mt-1" defaultValue="FRESH">
                <option value="FRESH">Fresh</option>
                <option value="RETURNING">Returning</option>
              </select>
            </div>
          </div>

          <fieldset className="rounded-lg border border-[var(--line)] p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-600">Fee items</legend>
            <div className="space-y-2.5">
              {Array.from({ length: itemRows }, (_, i) => (
                <div key={i} className="grid grid-cols-[1fr_110px_130px] gap-2">
                  <input name={`itemName${i}`} className="input" placeholder={`Item ${i + 1} name`} aria-label={`Item ${i + 1} name`} />
                  <input name={`itemAmount${i}`} type="number" min={0} step="0.01" className="input" placeholder="₦ amount" aria-label={`Item ${i + 1} amount`} />
                  <select name={`itemCategory${i}`} className="input" aria-label={`Item ${i + 1} category`} defaultValue="OTHER">
                    {["TUITION", "REGISTRATION", "LIBRARY", "ICT", "EXAMINATION", "DEVELOPMENT", "MEDICAL", "STUDENT_UNION", "ACCEPTANCE", "OTHER"].map((c) => (
                      <option key={c} value={c}>{c.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {itemRows < 10 && (
              <button type="button" className="btn-ghost btn-sm mt-2.5" onClick={() => setItemRows((n) => n + 1)}>
                + Add item row
              </button>
            )}
          </fieldset>

          <button type="submit" className="btn-primary" disabled={busy} aria-busy={busy}>
            {busy ? "Creating…" : "Create fee structure"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto" role="region" aria-label="Fee structures" tabIndex={0}>
        <table className="table-base min-w-[780px]">
          <caption className="sr-only">Fee structures per session, programme and level</caption>
          <thead>
            <tr>
              <th scope="col">Session</th>
              <th scope="col">Programme</th>
              <th scope="col">Level</th>
              <th scope="col">Type</th>
              <th scope="col">Items</th>
              <th scope="col">Total</th>
              <th scope="col">Status</th>
              {canManage && <th scope="col"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {structures.map((s) => (
              <tr key={s.id}>
                <td className="text-sm">{s.session ?? "—"}</td>
                <td>
                  <div className="font-medium">{s.programme ?? "—"}</div>
                  <div className="text-xs text-ink-600">{s.programmeCode ?? ""}</div>
                </td>
                <td className="tabular-nums">{s.levelValue}</td>
                <td><span className="badge-gray">{s.studentType === "FRESH" ? "Fresh" : "Returning"}</span></td>
                <td className="tabular-nums">{s.itemCount}</td>
                <td className="font-semibold tabular-nums">{formatNaira(s.total)}</td>
                <td><StatusBadge status={s.isActive ? "ACTIVE" : "INACTIVE"} /></td>
                {canManage && (
                  <td className="text-right">
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={() => toggleActive(s.id, !s.isActive)}
                      disabled={busy}
                    >
                      {s.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
