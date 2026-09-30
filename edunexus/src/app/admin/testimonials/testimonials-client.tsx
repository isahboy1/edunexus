"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Alert, StatusBadge, formatStatus } from "@/components/ui";

/*
 * Same-origin client for the Next-side testimonials API (the data lives in the
 * Next/Prisma database, unlike the Laravel-backed admin surfaces). The session
 * cookie is httpOnly on this origin, so fetch() carries it automatically.
 */
async function localApi<T>(path: string, options: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`/api/v1${path}`, {
    method: options.method ?? "GET",
    // Matches lib/laravel.ts: never let the browser heuristic-cache serve a
    // stale list right after a successful mutation.
    cache: "no-store",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; message?: string; data?: T; errors?: Record<string, string[]> }
    | null;
  return {
    ok: res.ok && json?.success !== false,
    status: res.status,
    data: json?.data ?? null,
    message: json?.message ?? (res.ok ? "OK" : `Request failed (${res.status})`),
    errors: json?.errors ?? {},
  };
}

export type TestimonialRow = {
  id: string;
  studentName: string;
  role: string | null;
  quote: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  displayOrder: number;
};

const MAX_QUOTE = 600;

export function TestimonialsManager({ initial }: { initial: TestimonialRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoteLength, setQuoteLength] = useState(0);

  async function reload() {
    const res = await localApi<{ testimonials: TestimonialRow[] }>("/admin/testimonials");
    if (res.ok && res.data) setRows(res.data.testimonials);
  }

  async function create(fd: FormData) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await localApi("/admin/testimonials", {
      method: "POST",
      body: {
        studentName: String(fd.get("studentName") ?? ""),
        role: String(fd.get("role") ?? "") || null,
        quote: String(fd.get("quote") ?? ""),
        displayOrder: Number(fd.get("displayOrder") ?? 0) || 0,
        status: "DRAFT",
      },
    });
    if (res.ok) {
      setMessage("Quote saved as a draft — publish it when it reads well.");
      await reload();
      router.refresh();
    } else {
      setError(res.message || "Could not save the quote.");
    }
    setBusy(false);
  }

  async function setStatus(id: string, status: TestimonialRow["status"]) {
    setBusy(true);
    setError(null);
    const res = await localApi(`/admin/testimonials/${id}`, { method: "PATCH", body: { status } });
    if (res.ok) {
      setRows((current) => current.map((r) => (r.id === id ? { ...r, status } : r)));
      router.refresh();
    } else {
      setError(res.message || "Update failed.");
    }
    setBusy(false);
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete the quote from ${name}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    const res = await localApi(`/admin/testimonials/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRows((current) => current.filter((r) => r.id !== id));
      router.refresh();
    } else {
      setError(res.message || "Delete failed.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      {message && <Alert kind="success">{message}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      {/* Create */}
      <form
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          create(new FormData(e.currentTarget));
          e.currentTarget.reset();
          setQuoteLength(0);
        }}
        className="card-p space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
          <label className="block">
            <span className="label">Student name *</span>
            <input name="studentName" required minLength={2} maxLength={150} className="input" placeholder="Aisha Bello" />
          </label>
          <label className="block">
            <span className="label">Role / class</span>
            <input name="role" maxLength={150} className="input" placeholder="B.Sc Computer Science, 2025" />
          </label>
          <label className="block">
            <span className="label">Display order</span>
            <input name="displayOrder" type="number" min={0} max={9999} defaultValue={0} className="input" />
          </label>
        </div>
        <label className="block">
          <span className="label">Quote * <span className="ml-1 font-normal text-ink-400">({quoteLength}/{MAX_QUOTE} characters — shows on the public homepage)</span></span>
          <textarea
            name="quote"
            required
            minLength={10}
            maxLength={MAX_QUOTE}
            rows={3}
            className="textarea"
            placeholder="The portal made everything simple — from application to course registration."
            onChange={(e) => setQuoteLength(e.target.value.length)}
          />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className="btn-primary">Save draft</button>
          <p className="text-xs text-ink-400">New quotes start as drafts; publish from the list below.</p>
        </div>
      </form>

      {/* List */}
      <div className="card-flush divide-y divide-line">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-600">No testimonials yet — the section stays hidden on the homepage until one is published.</p>
        ) : (
          rows.map((t) => (
            <article key={t.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <p className="text-sm font-semibold text-ink-900">{t.studentName}</p>
                  {t.role && <span className="text-xs text-ink-400">· {t.role}</span>}
                  <StatusBadge status={formatStatus(t.status)} />
                  <span className="chip">#{t.displayOrder}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">&ldquo;{t.quote}&rdquo;</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {t.status === "PUBLISHED" ? (
                  <button type="button" disabled={busy} onClick={() => setStatus(t.id, "DRAFT")} className="btn-outline btn-sm">
                    Unpublish
                  </button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => setStatus(t.id, "PUBLISHED")} className="btn-primary btn-sm">
                    Publish
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(t.id, t.studentName)}
                  aria-label={`Delete quote from ${t.studentName}`}
                  className="btn-sm inline-flex h-8 w-8 items-center justify-center rounded-md border border-line-strong text-ink-600 transition hover:border-red-300 hover:text-red-600"
                >
                  <Icon name="x" className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
