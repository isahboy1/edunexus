export function formatNaira(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Programme display label. Some records already carry the award inside the
 * name ("B.Ed Educational Administration"), others don't — don't duplicate it.
 */
export function programmeLabel(p?: { award?: string | null; name?: string | null } | null): string {
  if (!p) return "—";
  const name = (p.name ?? "").trim();
  const award = (p.award ?? "").trim();
  if (!award) return name || "—";
  if (!name) return award;
  return name.toLowerCase().startsWith(award.toLowerCase()) ? name : `${award} ${name}`;
}

export function formatEnum(s: string | null | undefined): string {
  if (!s) return "—";
  return s
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}
