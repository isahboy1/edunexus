"use client";

import { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function FilterBar({
  programmes,
  statuses,
}: {
  programmes: { id: string; name: string; code: string }[];
  statuses: string[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const p = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (v) p.set(k, String(v));
    router.push(`/admin/applications?${p.toString()}`);
  }

  return (
    <form className="card-p mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={apply}>
      <div>
        <label className="label" htmlFor="q">Search</label>
        <input id="q" name="q" className="input" placeholder="Name or application no." defaultValue={sp.get("q") ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="status">Status</label>
        <select id="status" name="status" className="select" defaultValue={sp.get("status") ?? ""}>
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="readiness">Readiness</label>
        <select id="readiness" name="readiness" className="select" defaultValue={sp.get("readiness") ?? ""}>
          <option value="">All applications</option>
          <option value="INCOMPLETE">Incomplete — missing requirements</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="programmeId">Programme</label>
        <select id="programmeId" name="programmeId" className="select" defaultValue={sp.get("programmeId") ?? ""}>
          <option value="">All programmes</option>
          {programmes.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="type">Application Type</label>
        <select id="type" name="type" className="select" defaultValue={sp.get("type") ?? ""}>
          <option value="">All types</option>
          {["UTME", "DIRECT_ENTRY", "PART_TIME", "LONG_VACATION", "NCE", "DIPLOMA", "OTHER"].map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
      <div className="flex items-end gap-2">
        <button className="btn-primary flex-1" type="submit">Filter</button>
        <button className="btn-outline" type="button" onClick={() => router.push("/admin/applications")}>Reset</button>
      </div>
    </form>
  );
}
