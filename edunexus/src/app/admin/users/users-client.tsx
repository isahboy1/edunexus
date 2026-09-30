"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/laravel";
import { formatStatus, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: string;
  lastLoginAt?: string | null;
  roles: string[];
};

const SUB_ADMIN_ASSIGNABLE = [
  { value: "ADMISSIONS_OFFICER", label: "Admissions Officer" },
  { value: "ACADEMIC_OFFICER", label: "Academic Officer" },
  { value: "BURSARY_OFFICER", label: "Bursary Officer" },
  { value: "HOD", label: "Head of Department" },
  { value: "LECTURER", label: "Lecturer" },
];

const SUPER_ADMIN_ASSIGNABLE = [
  { value: "SUPER_ADMIN", label: "Super Administrator" },
  { value: "ADMIN", label: "Administrator (Sub-Admin)" },
  { value: "REGISTRAR", label: "Registrar" },
  ...SUB_ADMIN_ASSIGNABLE,
];

const FILTER_ROLES = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "ADMIN", label: "Administrator" },
  { value: "REGISTRAR", label: "Registrar" },
  { value: "ADMISSIONS_OFFICER", label: "Admissions Officer" },
  { value: "ACADEMIC_OFFICER", label: "Academic Officer" },
  { value: "BURSARY_OFFICER", label: "Bursary Officer" },
  { value: "HOD", label: "Head of Department" },
  { value: "LECTURER", label: "Lecturer" },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function UsersClient({
  users,
  subAdmin,
  currentUserId,
  page,
  pages,
  prevHref,
  nextHref,
  activeRole,
}: {
  users: UserRow[];
  subAdmin: boolean;
  currentUserId: string;
  page: number;
  pages: number;
  prevHref: string | null;
  nextHref: string | null;
  activeRole?: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetErrors, setResetErrors] = useState<Record<string, string[]>>({});

  const assignable = subAdmin ? SUB_ADMIN_ASSIGNABLE : SUPER_ADMIN_ASSIGNABLE;

  async function submitCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormErrors({});
    setFormMessage(null);
    const fd = new FormData(e.currentTarget);
    const roles = fd.getAll("roles").map(String);
    try {
      const res = await apiPost<{ user: { name: string } }>("/admin/users", {
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        phone: String(fd.get("phone") ?? "") || undefined,
        password: String(fd.get("password") ?? ""),
        role: String(fd.get("role") ?? ""),
      });
      // Route shape uses `roles[]`; Laravel controller accepts `role`.
      void roles;
      if (!res.ok) {
        setFormErrors(res.errors);
        setFormMessage(res.message || "Could not create the user.");
        return;
      }
      setFormMessage(null);
      setShowForm(false);
      router.refresh();
    } catch {
      setFormMessage("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetBusy(true);
    setResetErrors({});
    setResetMessage(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await apiPost(`/admin/users/${resetTarget.id}/reset-password`, {
        newPassword: String(fd.get("newPassword") ?? ""),
      });
      if (!res.ok) {
        setResetErrors(res.errors);
        setResetMessage(res.message || "Could not reset the password.");
        return;
      }
      setResetMessage("Password updated. Share it with the user securely.");
    } catch {
      setResetMessage("Network error — please try again.");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[#fcfdfb] px-5 py-3.5">
        <form className="flex items-center gap-2" action="/admin/users" method="get" role="search">
          <label htmlFor="role-filter" className="sr-only">
            Filter by role
          </label>
          <select
            id="role-filter"
            name="role"
            defaultValue={activeRole ?? ""}
            className="input h-9 w-56 py-0 text-sm"
          >
            <option value="">All roles</option>
            {FILTER_ROLES.filter((r) => !subAdmin || !["SUPER_ADMIN", "ADMIN", "REGISTRAR"].includes(r.value)).map(
              (r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              )
            )}
          </select>
          <button type="submit" className="btn-outline btn-sm">
            <Icon name="filter" className="h-3.5 w-3.5" /> Filter
          </button>
        </form>
        <button type="button" className="btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
          <Icon name={showForm ? "x" : "user"} className="h-3.5 w-3.5" />
          {showForm ? "Close" : "New user"}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={submitCreate}
          className="grid gap-4 border-b border-[var(--line)] bg-[#fbfcfa] px-5 py-5 sm:grid-cols-2"
          aria-label="Create staff user"
        >
          {formMessage && (
            <div className="sm:col-span-2">
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {formMessage}
              </div>
            </div>
          )}
          <div>
            <label htmlFor="new-name" className="label">
              Full name <span className="text-red-500">*</span>
            </label>
            <input id="new-name" name="name" type="text" required minLength={2} maxLength={150}
              className="input mt-1" placeholder="e.g. Amina Bello" autoComplete="off"
              aria-invalid={formErrors.name?.[0] ? true : undefined} />
            {formErrors.name?.[0] && <p className="error-text" role="alert">{formErrors.name[0]}</p>}
          </div>
          <div>
            <label htmlFor="new-email" className="label">
              Email <span className="text-red-500">*</span>
            </label>
            <input id="new-email" name="email" type="email" required className="input mt-1"
              placeholder="name@edunexus.edu.ng" autoComplete="off"
              aria-invalid={formErrors.email?.[0] ? true : undefined} />
            {formErrors.email?.[0] && <p className="error-text" role="alert">{formErrors.email[0]}</p>}
          </div>
          <div>
            <label htmlFor="new-phone" className="label">Phone</label>
            <input id="new-phone" name="phone" type="tel" maxLength={30} className="input mt-1"
              placeholder="Optional" autoComplete="off" />
          </div>
          <div>
            <label htmlFor="new-role" className="label">
              Role <span className="text-red-500">*</span>
            </label>
            <select id="new-role" name="role" required className="input mt-1" defaultValue="">
              <option value="" disabled>
                Select a role…
              </option>
              {assignable.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {subAdmin && (
              <p className="mt-1 text-[11px] text-ink-600">
                Sub-admins can create non-privileged roles only.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="new-password" className="label">
              Temporary password <span className="text-red-500">*</span>
            </label>
            <input id="new-password" name="password" type="text" required minLength={8}
              className="input mt-1" placeholder="Min. 8 characters" autoComplete="off"
              aria-invalid={formErrors.password?.[0] ? true : undefined} />
            {formErrors.password?.[0] && <p className="error-text" role="alert">{formErrors.password[0]}</p>}
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full" disabled={busy} aria-busy={busy}>
              {busy ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      )}

      {/* Directory table */}
      <div className="overflow-x-auto focus-visible:outline-offset-[-3px]" role="region" aria-label="User directory" tabIndex={0}>
        <table className="table-base min-w-[760px]">
          <caption className="sr-only">Portal accounts with roles, status and management actions</caption>
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Roles</th>
              <th scope="col">Status</th>
              <th scope="col">Last login</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const canReset = !isSelf && !(subAdmin && u.roles.some((r) => ["SUPER_ADMIN", "ADMIN", "REGISTRAR"].includes(r)));
              return (
                <tr key={u.id}>
                  <td>
                    <div className="font-medium text-ink-900">{u.name}{isSelf && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">(you)</span>}</div>
                    <div className="text-xs text-ink-600">{u.email}</div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 ? (
                        <span className="text-xs text-ink-400">—</span>
                      ) : (
                        u.roles.map((r) => (
                          <span key={r} className="badge-gray">{formatStatus(r)}</span>
                        ))
                      )}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="text-xs text-ink-600">{formatDate(u.lastLoginAt)}</td>
                  <td className="text-right">
                    {canReset ? (
                      <button
                        type="button"
                        className="btn-outline btn-sm"
                        onClick={() => {
                          setResetTarget(u);
                          setResetMessage(null);
                          setResetErrors({});
                        }}
                        aria-haspopup="dialog"
                      >
                        <Icon name="lock" className="h-3.5 w-3.5" /> Reset password
                      </button>
                    ) : (
                      <span className="text-xs text-ink-400">{isSelf ? "—" : "Out of scope"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(prevHref || nextHref) && (
        <div className="flex items-center justify-between border-t border-[var(--line)] bg-[#fcfdfb] px-5 py-3">
          {prevHref ? (
            <Link href={prevHref} className="btn-outline btn-sm">Previous</Link>
          ) : (
            <span />
          )}
          <span className="text-xs font-medium text-ink-600">Page {page} of {pages}</span>
          {nextHref ? (
            <Link href={nextHref} className="btn-outline btn-sm">Next</Link>
          ) : (
            <span />
          )}
        </div>
      )}

      {/* Reset password dialog */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 p-4" role="dialog" aria-modal="true" aria-label={`Reset password for ${resetTarget.name}`}>
          <div className="card-flush w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div>
                <h2 className="text-[15px] font-bold text-ink-900">Reset password</h2>
                <p className="mt-0.5 text-xs text-ink-600">{resetTarget.name} · {resetTarget.email}</p>
              </div>
              <button type="button" className="rounded-md p-1.5 text-ink-400 hover:bg-slate-100 hover:text-ink-700" onClick={() => setResetTarget(null)} aria-label="Close dialog">
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submitReset} className="space-y-4 px-5 py-5">
              {resetMessage && (
                <div
                  className={`rounded-lg px-4 py-3 text-sm ${resetErrors && Object.keys(resetErrors).length > 0 ? "border border-red-200 bg-red-50 text-red-700" : "border border-green-200 bg-green-50 text-green-800"}`}
                  role={Object.keys(resetErrors).length > 0 ? "alert" : "status"}
                >
                  {resetMessage}
                </div>
              )}
              <div>
                <label htmlFor="newPassword" className="label">
                  New password <span className="text-red-500">*</span>
                </label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="text"
                  required
                  minLength={8}
                  className="input mt-1"
                  placeholder="Min. 8 characters, letters and numbers"
                  autoComplete="off"
                  aria-invalid={resetErrors.newPassword?.[0] ? true : undefined}
                />
                {resetErrors.newPassword?.[0] && <p className="error-text" role="alert">{resetErrors.newPassword[0]}</p>}
                <p className="mt-1 text-[11px] text-ink-600">
                  Minimum 8 characters with letters and numbers. This clears any account lock.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-outline" onClick={() => setResetTarget(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={resetBusy} aria-busy={resetBusy}>
                  {resetBusy ? "Resetting…" : "Reset password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
