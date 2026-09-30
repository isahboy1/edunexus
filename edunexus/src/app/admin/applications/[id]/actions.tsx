"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { api } from "@/lib/laravel";

type Decision = {
  key: "REVIEW" | "SHORTLIST" | "SCREENING" | "REQUEST_CORRECTION" | "REJECT" | "ADMIT";
  label: string;
  caption: string;
  icon: IconName;
  style: "primary" | "outline" | "danger" | "accent";
  needsComment: boolean;
  commentLabel?: string;
};

const DECISIONS: Decision[] = [
  { key: "ADMIT", label: "Admit applicant", caption: "Issues an admission offer and a student number", icon: "sparkles", style: "accent", needsComment: true, commentLabel: "Offer conditions (optional)" },
  { key: "SHORTLIST", label: "Shortlist", caption: "Marks the dossier for the next review stage", icon: "list", style: "outline", needsComment: false },
  { key: "SCREENING", label: "Move to screening", caption: "Flags for physical credential screening", icon: "users", style: "outline", needsComment: false },
  { key: "REVIEW", label: "Start review", caption: "Moves a fresh submission into review", icon: "search", style: "outline", needsComment: false },
  { key: "REQUEST_CORRECTION", label: "Request correction", caption: "Returns the application to the applicant for edits", icon: "alert", style: "outline", needsComment: true, commentLabel: "What must be corrected? (required)" },
  { key: "REJECT", label: "Reject application", caption: "Declines the application — requires a reason", icon: "x", style: "danger", needsComment: true, commentLabel: "Reason for rejection (required)" },
];

const STYLE_CLS: Record<Decision["style"], string> = {
  accent: "btn-accent w-full justify-start",
  primary: "btn-primary w-full justify-start",
  outline: "btn-outline w-full justify-start",
  danger: "btn-danger w-full justify-start",
};

const COMMENT_REQUIRED = new Set(["REQUEST_CORRECTION", "REJECT"]);

export function ReviewActions({
  applicationId,
  status,
  hasAdmission,
}: {
  applicationId: string;
  status: string;
  hasAdmission: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Decision | null>(null);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Esc closes the confirm dialog (Cancel is the only other way out).
  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmOpen]);

  const reviewable = ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "SCREENING"].includes(status);

  const available = useMemo(
    () => DECISIONS.filter((d) => !(d.key === "ADMIT" && hasAdmission)),
    [hasAdmission]
  );

  const commentRequired = selected ? COMMENT_REQUIRED.has(selected.key) : false;
  const commentOk = !selected || !commentRequired || comments.trim().length > 0;

  function pick(d: Decision) {
    setSelected(d);
    setComments("");
    setError(null);
    setConfirmOpen(true);
  }

  function close() {
    setSelected(null);
    setComments("");
    setError(null);
    setConfirmOpen(false);
  }

  async function run() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const res = await api(`/admin/applications/${applicationId}/actions`, {
      method: "POST",
      body: { action: selected.key, comments: comments || undefined },
    });
    if (!res.ok) {
      setError(res.message || "Action failed");
      setBusy(false);
      return;
    }
    setBusy(false);
    close();
    router.refresh();
  }

  return (
    <>
      <div className="card-flush overflow-hidden">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-[15px] font-bold text-ink-900">Decision</h2>
          <p className="mt-0.5 text-xs text-ink-600">
            {reviewable
              ? "Pick an outcome — each action is audited and some require a note."
              : "This application is no longer in the review pipeline."}
          </p>
        </div>

        <div className="p-4">
          {!reviewable ? (
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-[13px] text-ink-600">
              Status is <strong className="text-ink-900">{formatHuman(status)}</strong>
              {hasAdmission ? " — an admission offer already exists for this applicant." : "."}
            </div>
          ) : (
            <div className="space-y-2">
              {available.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  disabled={busy}
                  onClick={() => pick(d)}
                  className={`${STYLE_CLS[d.style]} !py-3 disabled:cursor-not-allowed`}
                >
                  <Icon name={d.icon} className="h-[18px] w-[18px] shrink-0" />
                  <span className="flex min-w-0 flex-col items-start text-left">
                    <span>{d.label}</span>
                    <span className="text-[11px] font-medium opacity-70">{d.caption}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Confirm dialog ───────────────────────────────── */}
      {confirmOpen && selected && mounted &&
        createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="decision-title">
          <button type="button" aria-hidden tabIndex={-1} onClick={close} className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" />
          <div className="animate-fade-up relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3.5">
              <span
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
                  selected.style === "danger"
                    ? "bg-red-50 text-red-600 ring-red-100"
                    : selected.style === "accent"
                      ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
                      : "bg-brand-50 text-brand-700 ring-brand-100"
                }`}
              >
                <Icon name={selected.icon} className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 id="decision-title" className="text-[15px] font-extrabold text-ink-900">
                  {selected.label}
                </h3>
                <p className="mt-0.5 text-[13px] text-ink-600">{selected.caption}.</p>
              </div>
            </div>

            {selected.needsComment && (
              <div className="mt-4">
                <label className="label" htmlFor="decision-comments">
                  {selected.commentLabel} {commentRequired && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  id="decision-comments"
                  className="textarea"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  autoFocus
                  placeholder={
                    selected.key === "ADMIT"
                      ? "e.g. Subject to verification of original credentials…"
                      : selected.key === "REJECT"
                        ? "The applicant will see this note in their portal."
                        : "Tell the applicant exactly what to fix…"
                  }
                />
                <p className="mt-1 text-right text-[11px] text-ink-400">{comments.length}/2000</p>
              </div>
            )}

            {error && (
              <div className="mt-3">
                <Alert kind="error">{error}</Alert>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className={selected.style === "danger" ? "btn-danger" : selected.style === "accent" ? "btn-accent" : "btn-primary"}
                onClick={run}
                disabled={busy || !commentOk}
              >
                {busy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                    Working…
                  </>
                ) : (
                  <>
                    <Icon name="check" className="h-4 w-4" /> Confirm {selected.label.toLowerCase()}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function formatHuman(s: string) {
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
