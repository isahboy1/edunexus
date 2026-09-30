"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusBadge, Alert } from "@/components/ui";
import { Icon } from "@/components/icons";
import { programmeLabel, formatDateTime } from "@/lib/format";
import { api } from "@/lib/laravel";

export type QueueRow = {
  id: string;
  applicationNumber: string;
  applicationType: string;
  status: string;
  submittedAt: string | null;
  applicant: { surname: string; firstName: string; gender?: string | null; stateOfOrigin?: string | null };
  programme: { name: string; code: string; award?: string | null };
  academicSession: { name: string };
};

const REVIEWABLE = new Set(["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "SCREENING"]);

type Flash = { kind: "success" | "error"; text: string } | null;

/**
 * Admissions queue table — client component.
 *
 * Keyboard shortcuts (SRS §17): J/K move the cursor down/up through the rows,
 * Enter opens the dossier, A admits and R rejects the focused row. Shortcuts
 * are ignored while typing in an input/textarea/select or with modifiers, and
 * during the (debounced) shortcut window after an action fires.
 *
 * Selection checkboxes enable the bulk bar for batch-admitting shortlisted
 * applications in one audited transaction.
 */
export function QueueTable({
  rows,
  page,
  pages,
  prevHref,
  nextHref,
}: {
  rows: QueueRow[];
  page: number;
  pages: number;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const router = useRouter();
  const [cursor, setCursor] = useState(-1); // keyboard-selected row index
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkComments, setBulkComments] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Debounce window after an action so the confirm dialog's own keyup or a
  // double keypress can't re-trigger admit/reject on the row beneath it.
  const actionLock = useRef(0);
  const isLocked = () => Date.now() < actionLock.current;

  const selectable = useMemo(() => rows.filter((r) => REVIEWABLE.has(r.status)), [rows]);
  const shortlistedSelected = useMemo(
    () => rows.filter((r) => selected.has(r.id) && r.status === "SHORTLISTED").length,
    [rows, selected]
  );

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allChecked = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected((prev) => {
      if (selectable.every((r) => prev.has(r.id))) {
        const next = new Set(prev);
        for (const r of selectable) next.delete(r.id);
        return next;
      }
      return new Set([...prev, ...selectable.map((r) => r.id)]);
    });
  };

  const closeBulk = useCallback(() => {
    if (bulkBusy) return;
    setBulkOpen(false);
    setBulkComments("");
    setBulkError(null);
  }, [bulkBusy]);

  const runBulkAdmit = async () => {
    setBulkBusy(true);
    setBulkError(null);
    const res = await api<{ admitted: { applicationId: string; admissionNumber: string }[]; skipped: { id: string; reason: string }[] }>(
      "/admin/applications/bulk-admit",
      {
        method: "POST",
        body: {
          applicationIds: rows.filter((r) => selected.has(r.id) && r.status === "SHORTLISTED").map((r) => r.id),
          comments: bulkComments || undefined,
        },
      }
    );
    if (!res.ok) {
      setBulkError(res.message || "Bulk admit failed");
      setBulkBusy(false);
      return;
    }
    const admitted = res.data?.admitted?.length ?? 0;
    const skipped = res.data?.skipped?.length ?? 0;
    setBulkBusy(false);
    setBulkOpen(false);
    setBulkComments("");
    clearSelection();
    setFlash(
      { kind: "success", text: skipped > 0 ? `${admitted} admitted, ${skipped} skipped (status changed).` : `${admitted} applicant${admitted === 1 ? "" : "s"} admitted.` }
    );
    router.refresh();
  };

  async function runRowAction(id: string, action: "ADMIT" | "REJECT") {
    const res = await api(`/admin/applications/${id}/actions`, {
      method: "POST",
      body: { action, comments: action === "REJECT" ? "Rejected from admissions queue (keyboard action)." : undefined },
    });
    if (res.ok) {
      actionLock.current = Date.now() + 800;
      setFlash({ kind: "success", text: action === "ADMIT" ? "Applicant admitted." : "Application rejected." });
      router.refresh();
    } else {
      actionLock.current = Date.now() + 800;
      setFlash({ kind: "error", text: `${action === "ADMIT" ? "Admit" : "Reject"} failed: ${res.message}` });
    }
  }

  // Esc closes the bulk-admit dialog first, then clears selection/cursor.
  useEffect(() => {
    if (!bulkOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeBulk();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bulkOpen, closeBulk]);

  // Global keyboard handler — only when no dialog is open and the focus isn't
  // in a form field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (bulkOpen) return;
      const target = e.target as HTMLElement | null;
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable ||
            target.closest("[role=dialog]")))
      ) {
        return;
      }
      if (rows.length === 0) return;
      const key = e.key.toLowerCase();

      if (key === "j" || key === "arrowdown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, rows.length - 1));
      } else if (key === "k" || key === "arrowup") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (key === "enter" && cursor >= 0 && cursor < rows.length) {
        router.push(`/admin/applications/${rows[cursor].id}`);
      } else if ((key === "a" || key === "r") && cursor >= 0 && cursor < rows.length && !isLocked()) {
        const row = rows[cursor];
        if (!REVIEWABLE.has(row.status)) return;
        e.preventDefault();
        // Fire without blocking the handler; lock immediately.
        actionLock.current = Date.now() + 800;
        runRowAction(row.id, key === "a" ? "ADMIT" : "REJECT");
      } else if (key === "escape") {
        if (selected.size > 0) {
          clearSelection();
        } else if (cursor !== -1) {
          setCursor(-1);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cursor, bulkOpen, selected, router, clearSelection]);

  // Auto-clear the flash banner after a few seconds.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  // Add/remove kbd data attribute for cursor row styling
  const cursorRowProps = (i: number) => ({
    "data-cursor": cursor === i || undefined,
    className: `${cursor === i ? "bg-brand-50/60 outline outline-1 -outline-offset-1 outline-brand-300" : ""}`,
  });

  return (
    <>
      {flash && (
        <div className="mb-3 animate-fade-up" role="status">
          <Alert kind={flash.kind}>{flash.text}</Alert>
        </div>
      )}

      <div className="card-flush overflow-hidden">
        {selected.size > 0 && (
          <div
            className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-brand-200 bg-brand-50/95 px-5 py-3 backdrop-blur"
            data-testid="bulk-bar"
          >
            <p className="text-[13px] font-semibold text-brand-900">
              {selected.size} selected
              {shortlistedSelected > 0 && (
                <span className="ml-1 font-normal text-brand-700">· {shortlistedSelected} shortlisted, ready to admit</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={clearSelection} disabled={bulkBusy}>
                Clear
              </button>
              <button
                type="button"
                className="btn-accent btn-sm"
                onClick={() => setBulkOpen(true)}
                disabled={shortlistedSelected === 0 || bulkBusy}
                title={
                  shortlistedSelected === 0
                    ? "Only SHORTLISTED applications can be bulk-admitted"
                    : `Admit ${shortlistedSelected} shortlisted applicant${shortlistedSelected === 1 ? "" : "s"}`
                }
              >
                <Icon name="sparkles" className="h-4 w-4" /> Admit {shortlistedSelected} shortlisted
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-10 !px-3">
                  <input
                    type="checkbox"
                    className="checkbox"
                    aria-label="Select all reviewable rows"
                    checked={allChecked}
                    onChange={toggleAll}
                    disabled={selectable.length === 0}
                  />
                </th>
                <th>Application</th><th>Applicant</th><th>Programme</th><th>Type</th>
                <th>Status</th><th>Submitted</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => {
                const selectableRow = REVIEWABLE.has(a.status);
                return (
                  <tr key={a.id} {...cursorRowProps(i)}>
                    <td className="!px-3">
                      <input
                        type="checkbox"
                        className="checkbox"
                        aria-label={`Select ${a.applicationNumber}`}
                        checked={selected.has(a.id)}
                        onChange={() => toggleRow(a.id)}
                        disabled={!selectableRow}
                      />
                    </td>
                    <td className="font-mono text-xs text-ink-700">{a.applicationNumber}</td>
                    <td>
                      <p className="font-semibold text-ink-900">
                        {a.applicant.surname} {a.applicant.firstName}
                      </p>
                      <p className="text-xs text-ink-400">
                        {[a.applicant.gender, a.applicant.stateOfOrigin].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="max-w-[220px]">
                      <p className="truncate text-ink-900">{programmeLabel(a.programme)}</p>
                      <p className="text-xs text-ink-400">{a.academicSession.name}</p>
                    </td>
                    <td className="text-xs text-ink-600">{a.applicationType.replace(/_/g, " ")}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className="whitespace-nowrap text-xs text-ink-600">
                      {a.submittedAt ? formatDateTime(a.submittedAt) : "—"}
                    </td>
                    <td className="text-right">
                      <Link className="btn-outline btn-sm" href={`/admin/applications/${a.id}`}>
                        Review <Icon name="chevronRight" className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-3.5">
            <Link
              className={`btn-outline btn-sm ${!prevHref ? "pointer-events-none opacity-40" : ""}`}
              href={prevHref ?? "#"}
              aria-disabled={!prevHref}
            >
              Previous
            </Link>
            <span className="text-xs font-medium text-ink-600">
              Page <span className="tabular-nums">{page}</span> of <span className="tabular-nums">{pages}</span>
            </span>
            <Link
              className={`btn-outline btn-sm ${!nextHref ? "pointer-events-none opacity-40" : ""}`}
              href={nextHref ?? "#"}
              aria-disabled={!nextHref}
            >
              Next
            </Link>
          </div>
        )}
      </div>

      {/* Shortcut legend */}
      <p className="mt-3 hidden items-center justify-center gap-3 text-[11px] text-ink-400 sm:flex" aria-hidden>
        <span><Kbd>J</Kbd>/<Kbd>K</Kbd> move</span>
        <span><Kbd>Enter</Kbd> open</span>
        <span><Kbd>A</Kbd> admit</span>
        <span><Kbd>R</Kbd> reject</span>
        <span><Kbd>Esc</Kbd> clear selection</span>
      </p>

      {/* ── Bulk-admit confirm dialog ────────────────────── */}
      {bulkOpen && mounted &&
        createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-admit-title">
          <button type="button" aria-label="Cancel" onClick={closeBulk} className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" />
          <div className="animate-fade-up relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3.5">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100">
                <Icon name="sparkles" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 id="bulk-admit-title" className="text-[15px] font-extrabold text-ink-900">
                  Admit {shortlistedSelected} shortlisted applicant{shortlistedSelected === 1 ? "" : "s"}
                </h3>
                <p className="mt-0.5 text-[13px] text-ink-600">
                  Issues an admission offer for each selected applicant. Every admit is audited individually.
                </p>
              </div>
            </div>

            <div className="mt-4 max-h-44 overflow-y-auto rounded-lg border border-[var(--line)] bg-slate-50/70 px-3.5 py-2.5">
              <ul className="space-y-1 text-[12px] text-ink-700">
                {rows.filter((r) => selected.has(r.id) && r.status === "SHORTLISTED").map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[11px]">{r.applicationNumber}</span>
                    <span className="truncate font-semibold text-ink-900">
                      {r.applicant.surname} {r.applicant.firstName}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4">
              <label className="label" htmlFor="bulk-comments">
                Offer note <span className="font-normal text-ink-400">(applied to each offer, optional)</span>
              </label>
              <textarea
                id="bulk-comments"
                className="textarea"
                value={bulkComments}
                onChange={(e) => setBulkComments(e.target.value)}
                maxLength={2000}
                rows={2}
                placeholder="e.g. Subject to verification of original credentials…"
              />
            </div>

            {bulkError && (
              <div className="mt-3">
                <Alert kind="error">{bulkError}</Alert>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={closeBulk} disabled={bulkBusy}>
                Cancel
              </button>
              <button type="button" className="btn-accent" onClick={runBulkAdmit} disabled={bulkBusy}>
                {bulkBusy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                    Admitting…
                  </>
                ) : (
                  <>
                    <Icon name="check" className="h-4 w-4" /> Confirm admit
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

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-sans text-[10px] font-bold text-ink-600 shadow-sm">
      {children}
    </kbd>
  );
}
