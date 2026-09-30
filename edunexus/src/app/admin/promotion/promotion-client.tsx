"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/laravel";
import { Icon } from "@/components/icons";

export function PromotionClient({
  byLevel,
  maxLevel,
  levels,
}: {
  byLevel: { levelValue: number; count: number }[];
  maxLevel: number;
  levels: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ from: number; to: number } | null>(null);

  const peak = Math.max(1, ...byLevel.map((l) => l.count));

  function requestPromotion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const from = Number(fd.get("fromLevel"));
    const to = Number(fd.get("targetLevel"));
    if (!from || !to || to <= from) {
      setMessage({ kind: "err", text: "Target level must be higher than the source level." });
      return;
    }
    setConfirmTarget({ from, to });
  }

  async function runPromotion() {
    if (!confirmTarget) return;
    setBusy("promote");
    setMessage(null);
    try {
      const res = await apiPost<{ promoted: number }>("/admin/promotion/apply", {
        fromLevel: confirmTarget.from,
        targetLevel: confirmTarget.to,
      });
      if (!res.ok) {
        setMessage({ kind: "err", text: res.message || "Promotion failed." });
      } else {
        setMessage({ kind: "ok", text: `Promoted ${res.data?.promoted ?? 0} student(s) to ${confirmTarget.to} level.` });
        router.refresh();
      }
    } catch {
      setMessage({ kind: "err", text: "Network error — please try again." });
    } finally {
      setBusy(null);
      setConfirmTarget(null);
    }
  }

  return (
    <div className="space-y-5 p-5">
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.kind === "ok"
              ? "border border-green-200 bg-green-50 text-green-800"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
          role={message.kind === "ok" ? "status" : "alert"}
        >
          {message.text}
        </div>
      )}

      <ul className="space-y-4">
        {byLevel.map((l) => (
          <li key={l.levelValue}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="badge-gray">{l.levelValue} Level</span>
              <span className="text-sm font-bold tabular-nums text-ink-900">{l.count}</span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label={`${l.levelValue} level students`}
              aria-valuenow={l.count}
              aria-valuemin={0}
              aria-valuemax={peak}
            >
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(4, (l.count / peak) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={requestPromotion} className="flex flex-wrap items-end gap-3 border-t border-[var(--line)] pt-5">
        <div>
          <label htmlFor="fromLevel" className="label">From level</label>
          <select id="fromLevel" name="fromLevel" required className="input mt-1 min-w-36" defaultValue="">
            <option value="" disabled>Select…</option>
            {levels.filter((l) => Number(l.value) < maxLevel).map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="targetLevel" className="label">To level</label>
          <select id="targetLevel" name="targetLevel" required className="input mt-1 min-w-36" defaultValue="">
            <option value="" disabled>Select…</option>
            {levels.filter((l) => Number(l.value) > 100).map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={busy !== null} aria-busy={busy === "promote"}>
          <Icon name="cap" className="h-4 w-4" /> Promote cohort
        </button>
      </form>

      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 p-4" role="dialog" aria-modal="true" aria-label="Confirm promotion">
          <div className="card-flush w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-[15px] font-bold text-ink-900">Confirm promotion</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">
                Promote all active {confirmTarget.from}-level students to {confirmTarget.to} level? Final-year
                students are never promoted and every change is recorded in the audit log.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button type="button" className="btn-outline" onClick={() => setConfirmTarget(null)} disabled={busy !== null}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={runPromotion} disabled={busy !== null} aria-busy={busy === "promote"}>
                {busy === "promote" ? "Promoting…" : "Confirm promotion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
