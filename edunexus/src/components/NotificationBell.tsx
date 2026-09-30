"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/laravel";
import { formatDateTime } from "@/lib/format";
import { Icon } from "@/components/icons";

type Notification = {
  id: string;
  subject: string | null;
  body: string;
  status: string;
  createdAt: string | null;
  readAt: string | null;
};

type Payload = {
  unread: number;
  notifications: Notification[];
};

/**
 * In-app notification bell for any portal header (SRS §35). Polls the shared
 * per-user feed — personal notifications plus staff broadcasts for staff
 * accounts — shows an unread badge (rows still in status SENT), and marks
 * them read when the panel is opened. Closes on outside click and Escape.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (markRead: boolean) => {
    // Shared per-user feed: personal rows plus staff broadcasts.
    const res = await apiGet<Payload>("/notifications");
    if (res.ok && res.data) {
      setPayload(res.data);
      setError(false);
      if (markRead && (res.data.unread ?? 0) > 0) {
        await apiPost("/notifications/read");
        setPayload({ ...res.data, unread: 0, notifications: res.data.notifications.map((n) => ({ ...n, status: "READ" })) });
      }
    } else {
      setError(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Initial fetch resolves in a promise callback (not synchronously in the
    // effect body) — the poll interval refreshes it every minute thereafter.
    apiGet<Payload>("/notifications").then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        setPayload(res.data);
        setError(false);
      } else {
        setError(true);
      }
    });
    const id = window.setInterval(() => void load(false), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = payload?.unread ?? 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void load(true);
        }}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-line-strong text-ink-700 transition hover:border-brand-600 hover:text-brand-800"
      >
        <Icon name="bell" className="h-4 w-4" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-xl"
          role="region"
          aria-label="Notifications list"
        >
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
            <p className="text-[13px] font-bold text-ink-900">Notifications</p>
            <span className="text-[11px] text-ink-400">
              {unread > 0 ? `${unread} new` : "All read"}
            </span>
          </div>
          <ul className="max-h-80 divide-y divide-[var(--line)] overflow-y-auto">
            {error && (
              <li className="px-4 py-6 text-center text-xs text-ink-500" role="alert">
                Notifications are unavailable right now.
              </li>
            )}
            {!error && (payload?.notifications ?? []).length === 0 && (
              <li className="px-4 py-6 text-center text-xs text-ink-500">
                Nothing yet — payment updates will appear here.
              </li>
            )}
            {(payload?.notifications ?? []).map((n) => {
              const unreadItem = n.status === "SENT";
              return (
                <li key={n.id} className={unreadItem ? "bg-brand-50/60" : ""}>
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-[13px] font-semibold text-ink-900 ${unreadItem ? "" : "text-ink-600"}`}>
                        {n.subject ?? "Notification"}
                      </p>
                      {unreadItem && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" aria-label="Unread" />}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{n.body}</p>
                    <p className="mt-1 text-[10.5px] text-ink-400">{formatDateTime(n.createdAt)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
