"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/laravel";
import { Icon } from "@/components/icons";

export function ResultActions({
  id,
  status,
  courseCode,
}: {
  id: string;
  status: string;
  courseCode: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "APPROVE" | "PUBLISH" | "REJECT") {
    setBusy(action);
    setError(null);
    try {
      const res = await apiPost(`/admin/results/${id}/action`, { action });
      if (!res.ok) setError(res.message || "Action failed.");
      else router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }

  const canApprove = status === "SUBMITTED";
  const canPublish = status === "APPROVED";
  const canReject = status === "SUBMITTED" || status === "APPROVED";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {canApprove && (
          <button type="button" className="btn-outline btn-sm" onClick={() => run("APPROVE")} disabled={busy !== null} aria-busy={busy === "APPROVE"}>
            <Icon name="check" className="h-3.5 w-3.5" /> Approve
          </button>
        )}
        {canPublish && (
          <button type="button" className="btn-primary btn-sm" onClick={() => run("PUBLISH")} disabled={busy !== null} aria-busy={busy === "PUBLISH"}>
            <Icon name="checkCircle" className="h-3.5 w-3.5" /> Publish
          </button>
        )}
        {canReject && (
          <button
            type="button"
            className="btn-outline btn-sm border-red-200 text-red-700 hover:bg-red-50"
            onClick={() => run("REJECT")}
            disabled={busy !== null}
            aria-busy={busy === "REJECT"}
            aria-label={`Reject result for ${courseCode}`}
          >
            Reject
          </button>
        )}
        {!canApprove && !canPublish && !canReject && <span className="text-xs text-ink-400">—</span>}
      </div>
      {error && <p className="error-text text-right" role="alert">{error}</p>}
    </div>
  );
}
