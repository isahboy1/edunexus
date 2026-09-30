"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Alert, Spinner, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { programmeLabel } from "@/lib/format";
import { api } from "@/lib/laravel";

interface ProgrammeOption {
  id: string;
  name: string;
  code: string;
  award: string | null;
  department: string;
}

const APP_TYPES = [
  { value: "UTME", label: "UTME (Post-UTME)" },
  { value: "DIRECT_ENTRY", label: "Direct Entry" },
  { value: "PART_TIME", label: "Part-Time Degree" },
  { value: "LONG_VACATION", label: "Long Vacation Degree" },
  { value: "NCE", label: "NCE" },
  { value: "DIPLOMA", label: "Diploma" },
  { value: "OTHER", label: "Other" },
];

export default function ApplyPage() {
  const router = useRouter();
  const [programmes, setProgrammes] = useState<ProgrammeOption[]>([]);
  const [allowedTypes, setAllowedTypes] = useState<string[] | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    (async () => {
      try {
        // Laravel: /programmes returns a bare array, /public/admission-info
        // carries the fee + allowed application types for the active window.
        const [progs, info] = await Promise.all([
          api<ProgrammeOption[]>("/programmes"),
          api<{ fee: number | null; allowedTypes: string[] | null }>("/public/admission-info"),
        ]);
        if (progs.ok && progs.data) setProgrammes(progs.data);
        else setMessage(progs.message || "Failed to load programmes");
        if (!info.ok && progs.ok) setMessage(info.message || "Unable to load admission options.");
        if (info.ok && info.data) {
          setAllowedTypes(info.data.allowedTypes ?? null);
          setFee(info.data.fee ?? null);
        }
      } catch {
        setMessage("Unable to load application options. Please refresh and try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      programmeId: fd.get("programmeId"),
      applicationType: fd.get("applicationType"),
      studyMode: fd.get("studyMode"),
      entryLevelValue: fd.get("entryLevelValue") ? Number(fd.get("entryLevelValue")) : undefined,
    };
    try {
      // Laravel returns the created application directly at `data`.
      const res = await api<{ id: string }>("/applicant/applications", { method: "POST", body });
      if (!res.ok) {
        setErrors(res.errors);
        setMessage(res.message || "Could not start application");
        return;
      }
      router.push(`/applicant/application/${res.data?.id}`);
    } catch {
      setMessage("Network error — please try again");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-2xl"><Spinner label="Loading programmes…" /></div>;

  const types = allowedTypes ? APP_TYPES.filter((t) => allowedTypes.includes(t.value)) : APP_TYPES;
  const canStartApplication = programmes.length > 0 && types.length > 0;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader
        eyebrow="Admissions"
        title="Start a new application"
        description="Choose your programme and application type — you can save and continue at any time."
        icon="file"
      />

      <section aria-labelledby="programme-selection-heading" className="card-p">
        <div className="mb-5 flex items-center gap-3 border-b border-[var(--line)] pb-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
            <Icon name="book" className="h-5 w-5" />
          </span>
          <div>
            <h2 id="programme-selection-heading" className="text-[15px] font-bold text-ink-900">Programme selection</h2>
            <p className="text-xs text-ink-600">
              {fee !== null ? (
                <>Application fee: <strong className="text-ink-900"><span className="mr-[3px]">₦</span>{fee.toLocaleString()}</strong>, payable after this step.</>
              ) : (
                "Fee is published once the admission window is configured."
              )}
            </p>
          </div>
        </div>

        {message && <div className="mb-4"><Alert kind="error">{message}</Alert></div>}
        {!programmes.length && !message && (
          <div className="mb-4"><Alert kind="warn">No programmes are currently open for application. Please contact admissions for assistance.</Alert></div>
        )}
        {!types.length && (
          <div className="mb-4"><Alert kind="warn">No application types are configured for the current admission window.</Alert></div>
        )}

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <Field
            label="Programme"
            name="programmeId"
            required
            disabled={!programmes.length}
            error={errors.programmeId?.[0]}
            options={programmes.map((p) => ({
              value: p.id,
              label: `${programmeLabel(p)} — ${p.department}`,
            }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Application Type" name="applicationType" required disabled={!types.length} error={errors.applicationType?.[0]} options={types} />
            <Field
              label="Study Mode"
              name="studyMode"
              required
              error={errors.studyMode?.[0]}
              options={[
                { value: "FULL_TIME", label: "Full-Time" },
                { value: "PART_TIME", label: "Part-Time" },
                { value: "SANDWICH", label: "Sandwich" },
                { value: "REMOTE", label: "Remote" },
              ]}
            />
          </div>
          <Field
            label="Entry Level (Direct Entry — optional)"
            name="entryLevelValue"
            type="number"
            min={100}
            max={500}
            error={errors.entryLevelValue?.[0]}
            placeholder="e.g. 200"
          />
          <button className="btn-primary btn-lg min-h-12 w-full" type="submit" disabled={busy || !canStartApplication} aria-busy={busy}>
            {busy ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                Creating application…
              </>
            ) : (
              <>
                Continue to application form <Icon name="arrowRight" className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </section>
    </div>
  );
}
