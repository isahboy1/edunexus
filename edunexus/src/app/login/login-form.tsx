"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Field } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api, setToken, type LoginResponse, homeForRoles } from "@/lib/laravel";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedNext = params.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.includes("\\") ? requestedNext : null;
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: Object.fromEntries(fd.entries()),
        token: null, // login request carries no bearer token
      });
      if (!res.ok) {
        setErrors(res.errors);
        setMessage(res.message || "Login failed");
        return;
      }
      if (res.data?.token) setToken(res.data.token);
      router.push(next || homeForRoles(res.data?.user?.roles ?? []));
      router.refresh();
    } catch {
      setMessage("Unable to reach the sign-in service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up">

      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-600">EduNexus portal</p>
      <h1 className="mt-2 text-[1.8rem] font-semibold tracking-[-0.03em] text-brand-950">Welcome back.</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">Sign in to continue to your admissions, student or staff workspace.</p>

      {message && (
        <div className="mt-5">
          <Alert kind="error">{message}</Alert>
        </div>
      )}

      <form id="auth-form" tabIndex={-1} className="mt-7 space-y-5" onSubmit={onSubmit} noValidate>
        <Field
          label="Email Address"
          name="email"
          type="email"
          required
          placeholder="you@edunexus.edu.ng"
          autoComplete="username"
          error={errors.email?.[0]}
        />

        <div>
          <label className="label" htmlFor="password">
            Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              className="input min-h-11 pr-12"
              required
              autoComplete="current-password"
              aria-invalid={errors.password?.[0] ? true : undefined}
              aria-describedby={errors.password?.[0] ? "password-error" : undefined}
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 my-auto mr-0.5 inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-400 transition hover:bg-slate-100 hover:text-ink-700"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide">{showPassword ? "Hide" : "Show"}</span>
            </button>
          </div>
          {errors.password?.[0] && <p id="password-error" className="error-text" role="alert">{errors.password[0]}</p>}
        </div>

        <button className="btn-primary btn-lg min-h-12 w-full" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              Signing in…
            </>
          ) : (
            <>
              Login <Icon name="arrowRight" className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-7 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-400">
        <span className="h-px flex-1 bg-[var(--line)]" />
        New to EduNexus
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>

      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
        <Link href="/register" className="btn-outline flex-1">
          Create applicant account
        </Link>
        <Link href="/" className="btn-ghost flex-1 border border-transparent">
          Back to site
        </Link>
      </div>
    </div>
  );
}
