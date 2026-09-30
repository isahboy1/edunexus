import { Icon, type IconName } from "@/components/icons";
import { formatDateTime } from "@/lib/format";

export type TimelineEvent = {
  key: string;
  label: string;
  description?: string | null;
  at: string | null;
  icon: IconName;
  tone: "done" | "muted" | "active" | "danger";
  note?: string | null;
};

const STATE_META: Record<
  string,
  { label: string; icon: IconName; description: string }
> = {
  created: { label: "Application created", icon: "file", description: "Dossier opened by the applicant" },
  payment: { label: "Application fee paid", icon: "wallet", description: "Payment verified via gateway" },
  submitted: { label: "Submitted for review", icon: "checkCircle", description: "Dossier locked and queued" },
  reviewed: { label: "Review started", icon: "search", description: "Officer began assessing the dossier" },
  decided: { label: "Decision recorded", icon: "shield", description: "Final outcome recorded" },
};

/**
 * Lifecycle rail for a single application. Derived from the dossier's
 * timestamp fields — no extra API call — with comments surfaced under the
 * step that produced them.
 */
export function ApplicationTimeline({
  status,
  createdAt,
  paymentConfirmedAt,
  submittedAt,
  reviewedAt,
  decidedAt,
  statusUpdatedAt,
  reviewComments,
  decisionComments,
}: {
  status: string;
  createdAt: string | null;
  paymentConfirmedAt?: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  decidedAt: string | null;
  statusUpdatedAt?: string | null;
  reviewComments?: string | null;
  decisionComments?: string | null;
}) {
  const paid = paymentConfirmedAt ?? (["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "SCREENING", "ADMITTED"].includes(status) ? submittedAt : null);
  const rejected = status === "REJECTED";
  const admitted = status === "ADMITTED";
  const stage = (at: string | null, later: boolean): "done" | "muted" => (at ? "done" : later ? "muted" : "muted");

  const events: TimelineEvent[] = [
    { key: "created", ...STATE_META.created, at: createdAt, tone: stage(createdAt, true) },
    { key: "payment", ...STATE_META.payment, at: paid, tone: paid ? "done" : "muted" },
    { key: "submitted", ...STATE_META.submitted, at: submittedAt, tone: submittedAt ? "done" : "muted" },
    {
      key: "reviewed",
      ...STATE_META.reviewed,
      at: reviewedAt,
      tone: reviewedAt ? "done" : ["SUBMITTED"].includes(status) ? "active" : "muted",
      note: reviewComments,
    },
    {
      key: "decided",
      ...STATE_META.decided,
      at: decidedAt ?? (admitted || rejected ? statusUpdatedAt ?? null : null),
      tone: decidedAt || admitted || rejected ? (rejected ? "danger" : "done") : ["UNDER_REVIEW", "SHORTLISTED", "SCREENING"].includes(status) ? "active" : "muted",
      note: decisionComments,
    },
  ];

  return (
    <ol className="relative space-y-0">
      {events.map((e, i) => {
        const last = i === events.length - 1;
        const isDone = e.tone === "done" || e.tone === "danger";
        return (
          <li key={e.key} className="relative flex gap-3.5 pb-6 last:pb-0">
            {/* rail */}
            {!last && (
              <span
                aria-hidden
                className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 ${isDone ? "bg-emerald-200" : "bg-slate-200"}`}
              />
            )}
            <span
              className={`relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${
                e.tone === "done"
                  ? "bg-emerald-50 text-emerald-600 ring-emerald-200"
                  : e.tone === "danger"
                    ? "bg-red-50 text-red-600 ring-red-200"
                    : e.tone === "active"
                      ? "bg-brand-50 text-brand-700 ring-brand-200"
                      : "bg-slate-50 text-ink-400 ring-slate-200"
              }`}
            >
              <Icon name={e.icon} className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className={`text-[13px] font-semibold ${isDone || e.tone === "active" ? "text-ink-900" : "text-ink-600"}`}>
                  {e.label}
                </p>
                <time className="text-[11px] tabular-nums text-ink-400">
                  {e.at ? formatDateTime(e.at) : "pending"}
                </time>
              </div>
              {e.at ? (
                <p className="mt-0.5 text-[11px] text-ink-400">{e.description}</p>
              ) : (
                <p className="mt-0.5 text-[11px] text-ink-400/70">Not yet reached</p>
              )}
              {e.note && (
                <p className="mt-2 rounded-lg border border-brand-100 bg-brand-50/70 px-3 py-2 text-[11px] leading-relaxed text-brand-900">
                  <span className="font-semibold">Officer note: </span>
                  {e.note}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
