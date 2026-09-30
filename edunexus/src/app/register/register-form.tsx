"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Field } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api, setToken, type LoginResponse } from "@/lib/laravel";

export default function RegisterForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd.entries()) as Record<string, string>;
    // Laravel validates `passwordConfirmation` (same:password)
    const body: Record<string, string> = { ...raw, passwordConfirmation: raw.confirmPassword };
    delete body.confirmPassword;

    try {
      const res = await api("/auth/register", { method: "POST", body, token: null });
      if (!res.ok) {
        const fieldErrors = { ...res.errors };
        if (fieldErrors.passwordConfirmation && !fieldErrors.confirmPassword) {
          fieldErrors.confirmPassword = fieldErrors.passwordConfirmation;
        }
        setErrors(fieldErrors);
        setMessage(res.message || "Registration failed");
        return;
      }

      // Registration doesn't issue a token — sign in right away.
      const login = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: { email: raw.email, password: raw.password },
        token: null,
      });
      if (login.ok && login.data?.token) {
        setToken(login.data.token);
        router.push("/applicant/dashboard");
        router.refresh();
      } else {
        router.push("/login");
      }
    } catch {
      setMessage("Unable to reach the registration service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-600">
        <Icon name="sparkles" className="h-3.5 w-3.5 text-accent-500" />
        Free to apply
      </span>

      <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-brand-950">Create your applicant account</h1>
      <p className="mt-1 text-sm text-ink-600">
        Your application number and admission status will be issued to this account.
      </p>

      {message && (
        <div className="mt-5">
          <Alert kind="error">{message}</Alert>
        </div>
      )}

      <form id="auth-form" tabIndex={-1} className="mt-6 space-y-6" onSubmit={onSubmit} noValidate>
        <fieldset className="space-y-4">
          <legend className="mb-3 flex w-full items-center gap-2 border-b border-[var(--line)] pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">
            <Icon name="user" className="h-3.5 w-3.5" /> Applicant details
          </legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Surname" name="surname" required autoComplete="family-name" error={errors.surname?.[0]} />
            <Field label="First Name" name="firstName" required autoComplete="given-name" error={errors.firstName?.[0]} />
            <Field label="Middle Name" name="middleName" autoComplete="additional-name" error={errors.middleName?.[0]} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Email Address"
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.email?.[0]}
            />
            <Field
              label="Phone Number"
              name="phone"
              required
              placeholder="08012345678"
              autoComplete="tel"
              error={errors.phone?.[0]}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 flex w-full items-center gap-2 border-b border-[var(--line)] pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">
            <Icon name="lock" className="h-3.5 w-3.5" /> Account security
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" name="password" type="password" required minLength={8} autoComplete="new-password" error={errors.password?.[0]} />
            <Field
              label="Confirm Password"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              error={errors.confirmPassword?.[0]}
            />
          </div>
          <p className="flex items-start gap-2 text-xs text-ink-600">
            <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
            Minimum 8 characters with at least one letter and one number.
          </p>
        </fieldset>

        <button className="btn-primary btn-lg min-h-12 w-full" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              Creating your account…
            </>
          ) : (
            <>
              Create Account <Icon name="arrowRight" className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-600">
        Already have an account?{" "}
        <Link className="font-semibold text-brand-700 hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
