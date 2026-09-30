"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { StatusBadge, formatStatus, Alert } from "@/components/ui";
import { api } from "@/lib/laravel";

export type ReviewDocument = {
  id: string;
  documentType: string;
  originalFileName: string | null;
  mimeType: string | null;
  fileSize: number;
  version: number;
  verificationStatus: string;
  uploadedAt: string | null;
};

function kindOf(doc: ReviewDocument): "pdf" | "image" | "other" {
  const mime = (doc.mimeType ?? "").toLowerCase();
  if (mime === "application/pdf" || doc.originalFileName?.toLowerCase().endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/")) return "image";
  return "other";
}

function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const KIND_ICON: Record<string, IconName> = { pdf: "file", image: "layers", other: "file" };

/**
 * In-context credential viewer for reviewers. Opens the Laravel-proxied stream
 * inside a modal (inline PDF via <object>, images via <img>), with download and
 * copy-file-name shortcuts. Every open is audited server-side.
 *
 * Officers can also mark each credential VERIFIED or REJECTED during review —
 * from the card row or inside the lightbox — with an optional note that lands
 * in the audit trail (DOCUMENT_VERIFIED / DOCUMENT_REJECTED).
 */
export function DocumentViewer({
  applicationId,
  documents,
  applicantName,
  canVerify = true,
}: {
  applicationId: string;
  documents: ReviewDocument[];
  applicantName: string;
  canVerify?: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Verification dialog state — keyed by document id so it survives refreshes.
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [verifyDecision, setVerifyDecision] = useState<"VERIFIED" | "REJECTED">("VERIFIED");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDoc = documents.find((d) => d.id === openId) ?? null;
  const verifyDoc = documents.find((d) => d.id === verifyId) ?? null;

  const src = openDoc
    ? `/api/v1/admin/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(openDoc.id)}`
    : null;

  const close = useCallback(() => {
    setOpenId(null);
    setLoaded(false);
    setFailed(false);
  }, []);

  function startVerify(docId: string, decision: "VERIFIED" | "REJECTED") {
    setVerifyId(docId);
    setVerifyDecision(decision);
    setNote("");
    setError(null);
  }

  function closeVerify() {
    if (busy) return;
    setVerifyId(null);
    setNote("");
    setError(null);
  }

  async function runVerify() {
    if (!verifyId) return;
    setBusy(true);
    setError(null);
    const res = await api(`/admin/applications/${applicationId}/documents/${verifyId}/verify`, {
      method: "POST",
      body: { decision: verifyDecision, note: note || undefined },
    });
    if (!res.ok) {
      setError(res.message || "Verification failed");
      setBusy(false);
      return;
    }
    setBusy(false);
    setVerifyId(null);
    setNote("");
    router.refresh(); // re-renders cards, lightbox badge and the dossier rail
  }

  // Esc closes the verification dialog first, then the lightbox; body scroll
  // is locked while the lightbox is open.
  useEffect(() => {
    if (!openDoc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (verifyId) {
        closeVerify();
      } else {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDoc, verifyId, close]);

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
        <p className="text-sm font-medium text-ink-700">No documents uploaded</p>
        <p className="mt-1 text-xs text-ink-600">The applicant did not attach any credentials to this dossier.</p>
      </div>
    );
  }

  const verifyButtons = (doc: ReviewDocument, lightbox = false) =>
    canVerify && doc.verificationStatus === "PENDING" ? (
      <div className={`flex gap-1.5 ${lightbox ? "" : "mt-0.5"}`}>
        <button
          type="button"
          disabled={busy}
          onClick={() => startVerify(doc.id, "VERIFIED")}
          title="Mark verified"
          aria-label={`Mark ${formatStatus(doc.documentType)} verified`}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
        >
          <Icon name="checkCircle" className="h-3.5 w-3.5" /> Verify
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => startVerify(doc.id, "REJECTED")}
          title="Mark rejected"
          aria-label={`Mark ${formatStatus(doc.documentType)} rejected`}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
        >
          <Icon name="x" className="h-3.5 w-3.5" /> Reject
        </button>
      </div>
    ) : null;

  return (
    <>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {documents.map((d) => {
          const kind = kindOf(d);
          return (
            <li
              key={d.id}
              className="group flex items-center gap-3 rounded-lg border border-[var(--line)] bg-white p-3 transition hover:border-brand-300 hover:shadow-sm"
            >
              <button
                type="button"
                onClick={() => {
                  setOpenId(d.id);
                  setLoaded(false);
                  setFailed(false);
                }}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                aria-label={`Preview ${formatStatus(d.documentType)}`}
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                  <Icon name={KIND_ICON[kind]} className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink-900">
                    {formatStatus(d.documentType)}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink-400">
                    {d.originalFileName ?? "file"} · v{d.version} · {fmtSize(d.fileSize)}
                  </span>
                </span>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <StatusBadge status={d.verificationStatus} />
                {verifyButtons(d)}
                <div className="flex gap-1">
                  {kind === "image" && (
                    <a
                      href={`/api/v1/admin/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(d.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Open in new tab"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-400 transition hover:bg-slate-100 hover:text-brand-700"
                    >
                      <Icon name="external" className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <a
                    href={`/api/v1/admin/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(d.id)}`}
                    download={d.originalFileName ?? undefined}
                    title="Download"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-400 transition hover:bg-slate-100 hover:text-brand-700"
                  >
                    <Icon name="download" className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* ── Lightbox ─────────────────────────────────────── */}
      {openDoc && mounted &&
        createPortal(
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-brand-950/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Document preview — ${formatStatus(openDoc.documentType)}`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5 text-white">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{formatStatus(openDoc.documentType)}</p>
              <p className="truncate text-[11px] text-white/60">
                {applicantName} · {openDoc.originalFileName} · v{openDoc.version}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {openDoc.verificationStatus === "PENDING" ? (
                verifyButtons(openDoc, true)
              ) : (
                <StatusBadge status={openDoc.verificationStatus} />
              )}
              <a
                href={src ?? "#"}
                download={openDoc.originalFileName ?? undefined}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/10 hover:text-white"
              >
                <Icon name="download" className="h-3.5 w-3.5" /> Download
              </a>
              <button
                type="button"
                onClick={close}
                aria-label="Close preview"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 text-white/85 transition hover:bg-white/10 hover:text-white"
              >
                <Icon name="x" className="h-4.5 w-4.5" strokeWidth={1.9} />
              </button>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center overflow-auto p-4 sm:p-6">
            {failed ? (
              <div className="max-w-sm rounded-lg bg-white p-8 text-center shadow-xl">
                <Icon name="alert" className="mx-auto h-6 w-6 text-amber-500" />
                <p className="mt-3 text-sm font-semibold text-ink-900">Preview unavailable</p>
                <p className="mt-1 text-xs text-ink-600">
                  The file could not be displayed inline. Use the download button above.
                </p>
              </div>
            ) : kindOf(openDoc) === "pdf" ? (
              <object
                data={src ?? undefined}
                type="application/pdf"
                className="h-full w-full rounded-lg bg-white shadow-2xl"
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
              >
                <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-600">
                  <Icon name="file" className="h-6 w-6" />
                  <p className="text-sm">Inline PDF preview is not supported in this browser.</p>
                  <a className="btn-primary btn-sm" href={src ?? "#"} download={openDoc.originalFileName ?? undefined}>
                    <Icon name="download" className="h-4 w-4" /> Download to view
                  </a>
                </div>
              </object>
            ) : kindOf(openDoc) === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src ?? undefined}
                alt={`${formatStatus(openDoc.documentType)} — ${applicantName}`}
                className="max-h-full max-w-full rounded-lg bg-white object-contain shadow-2xl"
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
              />
            ) : (
              <div className="max-w-sm rounded-lg bg-white p-8 text-center shadow-xl">
                <Icon name="file" className="mx-auto h-6 w-6 text-ink-400" />
                <p className="mt-3 text-sm font-semibold text-ink-900">
                  {formatStatus(openDoc.documentType)}
                </p>
                <p className="mt-1 text-xs text-ink-600">
                  This file type cannot be previewed inline — download it above.
                </p>
              </div>
            )}
          </div>

          {!loaded && !failed && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
            </div>
          )}
        </div>,
        document.body,
      )}

      {/* ── Verification dialog ──────────────────────────── */}
      {verifyDoc && mounted &&
        createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="doc-verify-title">
          <button type="button" aria-label="Cancel" onClick={closeVerify} className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" />
          <div className="animate-fade-up relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3.5">
              <span
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
                  verifyDecision === "REJECTED"
                    ? "bg-red-50 text-red-600 ring-red-100"
                    : "bg-emerald-50 text-emerald-600 ring-emerald-100"
                }`}
              >
                <Icon name={verifyDecision === "REJECTED" ? "x" : "checkCircle"} className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 id="doc-verify-title" className="text-[15px] font-extrabold text-ink-900">
                  {verifyDecision === "REJECTED" ? "Reject document" : "Mark document verified"}
                </h3>
                <p className="mt-0.5 text-[13px] text-ink-600">
                  {formatStatus(verifyDoc.documentType)} — {applicantName}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className="label" htmlFor="doc-verify-note">
                {verifyDecision === "REJECTED" ? "What is wrong with it?" : "Verification note"}{" "}
                <span className="font-normal text-ink-400">(optional)</span>
              </label>
              <textarea
                id="doc-verify-note"
                className="textarea"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={3}
                autoFocus
                placeholder={
                  verifyDecision === "REJECTED"
                    ? "e.g. Name on result slips does not match the passport."
                    : "e.g. Originals sighted and match the dossier."
                }
              />
              <p className="mt-1 text-right text-[11px] text-ink-400">{note.length}/1000</p>
            </div>

            {error && (
              <div className="mt-3">
                <Alert kind="error">{error}</Alert>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={closeVerify} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className={verifyDecision === "REJECTED" ? "btn-danger" : "btn-accent"}
                onClick={runVerify}
                disabled={busy}
              >
                {busy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                    Working…
                  </>
                ) : (
                  <>
                    <Icon name="check" className="h-4 w-4" />{" "}
                    {verifyDecision === "REJECTED" ? "Reject document" : "Confirm verified"}
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
