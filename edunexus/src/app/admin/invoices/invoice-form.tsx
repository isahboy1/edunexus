"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/laravel";
import { Icon } from "@/components/icons";

type StudentOption = { id: string; matric: string; name: string; programme?: string | null };

function StudentPicker({
  value,
  onChange,
}: {
  value: StudentOption | null;
  onChange: (s: StudentOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiGet<{ data: { id: string; matricNumber: string; user?: { name?: string } | null; currentProgramme?: { code?: string } | null }[] }>(
          `/admin/students?perPage=8${query ? `&q=${encodeURIComponent(query)}` : ""}`
        );
        if (!cancelled) {
          setResults(
            (res.data?.data ?? []).map((s) => ({
              id: s.id,
              matric: s.matricNumber,
              name: s.user?.name ?? "—",
              programme: s.currentProgramme?.code ?? null,
            }))
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query]);

  return (
    <div className="relative">
      <label htmlFor="student-search" className="label">
        Student <span className="text-red-500">*</span>
      </label>
      {value ? (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink-900">{value.name}</div>
            <div className="font-mono text-xs text-ink-600">{value.matric}{value.programme ? ` · ${value.programme}` : ""}</div>
          </div>
          <button type="button" className="btn-outline btn-sm" onClick={() => onChange(null)}>
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            id="student-search"
            type="text"
            className="input mt-1"
            placeholder="Search by matric no. or name…"
            value={query}
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            aria-expanded={open}
            role="combobox"
            aria-controls="student-picker-list"
          />
          {open && (
            <ul
              id="student-picker-list"
              className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--line)] bg-white shadow-lg"
              role="listbox"
            >
              {loading && <li className="px-3 py-2.5 text-xs text-ink-500">Searching…</li>}
              {!loading && results.length === 0 && (
                <li className="px-3 py-2.5 text-xs text-ink-500">No students match “{query}”.</li>
              )}
              {!loading &&
                results.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2.5 text-left hover:bg-slate-100"
                      onClick={() => {
                        onChange(s);
                        setOpen(false);
                      }}
                    >
                      <div className="text-sm font-medium text-ink-900">{s.name}</div>
                      <div className="font-mono text-xs text-ink-600">{s.matric}{s.programme ? ` · ${s.programme}` : ""}</div>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
      <input type="hidden" name="studentId" value={value?.id ?? ""} />
    </div>
  );
}

export function ManualInvoiceForm({ sessions }: { sessions: { value: string; label: string }[] }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentOption | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!student) {
      setError("Select a student first.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await apiPost<{ number: string }>("/admin/invoices", {
        studentId: student.id,
        sessionId: String(fd.get("sessionId") ?? ""),
        total: Number(fd.get("total") ?? 0),
        dueDate: String(fd.get("dueDate") ?? "") || undefined,
      });
      if (!res.ok) {
        setError(res.message || "Could not create the invoice.");
        return;
      }
      setShow(false);
      setStudent(null);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!show) {
    return (
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={() => setShow(true)}>
          <Icon name="receipt" className="h-4 w-4" /> New manual invoice
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card-flush space-y-4 p-5" aria-label="Create manual invoice">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <StudentPicker value={student} onChange={setStudent} />
        <div>
          <label htmlFor="sessionId" className="label">
            Session <span className="text-red-500">*</span>
          </label>
          <select id="sessionId" name="sessionId" required className="input mt-1" defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {sessions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="total" className="label">
            Total amount (₦) <span className="text-red-500">*</span>
          </label>
          <input id="total" name="total" type="number" min={0} step="0.01" required className="input mt-1" />
        </div>
        <div>
          <label htmlFor="dueDate" className="label">Due date</label>
          <input id="dueDate" name="dueDate" type="date" className="input mt-1" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy} aria-busy={busy}>
          {busy ? "Creating…" : "Create invoice"}
        </button>
        <button type="button" className="btn-outline" onClick={() => setShow(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
