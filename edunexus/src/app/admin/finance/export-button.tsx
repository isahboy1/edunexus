"use client";

import { useState } from "react";
import { getToken, LARAVEL_API_URL } from "@/lib/laravel";

/**
 * Downloads the finance summary CSV with a direct fetch so the raw file body
 * survives (the JSON client would try to parse it). The Sanctum token cookie
 * is attached manually; `days` mirrors the summary's window selector.
 */
export function ExportCsvButton({ days }: { days: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const token = getToken();
      const res = await fetch(`${LARAVEL_API_URL}/admin/finance-summary/export?days=${days}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        setError(`Export failed (${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `finance-summary-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" className="btn-outline btn-sm" onClick={download} disabled={busy} aria-busy={busy}>
        Export CSV
      </button>
      {error && (
        <p className="error-text text-right" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
