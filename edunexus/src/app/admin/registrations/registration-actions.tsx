"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/laravel";
import { Icon } from "@/components/icons";

export function RegistrationActions({
  id,
  status,
  studentName,
}: {
  id: string;
  status: string;
  studentName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "HOD_APPROVE" | "FINAL_APPROVE" | "REJECT") {
    setBusy(action);
    setError(null);
    try {
      const res = await apiPost(`/admin/registrations/${id}/approve`, { action });
      if (!res.ok) setError(res.message || "Action failed.");
      else router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }

  const canHod = status === "SUBMITTED";
  const canFinal = status === "HOD_APPROVED";
  const canReject = status === "SUBMITTED" || status === "HOD_APPROVED";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {canHod && (
          <button type="button" className="btn-outline btn-sm" onClick={() => run("HOD_APPROVE")} disabled={busy !== null} aria-busy={busy === "HOD_APPROVE"}>
            <Icon name="check" className="h-3.5 w-3.5" /> HOD approve
          </button>
        )}
        {canFinal && (
          <button type="button" className="btn-primary btn-sm" onClick={() => run("FINAL_APPROVE")} disabled={busy !== null} aria-busy={busy === "FINAL_APPROVE"}>
            <Icon name="checkCircle" className="h-3.5 w-3.5" /> Final approve
          </button>
        )}
        {canReject && (
          <button
            type="button"
            className="btn-outline btn-sm border-red-200 text-red-700 hover:bg-red-50"
            onClick={() => run("REJECT")}
            disabled={busy !== null}
            aria-busy={busy === "REJECT"}
            aria-label={`Reject registration for ${studentName}`}
          >
            Reject
          </button>
        )}
        {!canHod && !canFinal && !canReject && <span className="text-xs text-ink-400">—</span>}
      </div>
      {error && <p className="error-text text-right" role="alert">{error}</p>}
    </div>
  );
}
