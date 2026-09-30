/**
 * Laravel API client (Sanctum Bearer tokens).
 *
 * Every frontend call to the EDUNEXUS Laravel backend (/api/v1) goes through
 * this module. It stores the bearer token in a JS-readable cookie (shared with
 * server components via getSessionUser()) and unwraps the standard Laravel
 * envelope { ok, message?, data } into a small result object that mirrors the
 * fetch()-style checks the pages already use.
 */

export const LARAVEL_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";

/** JS-readable cookie: server components read it, client fetches send it. */
export const TOKEN_COOKIE = "edunexus_token";
const TOKEN_MAX_AGE = 12 * 60 * 60; // seconds — matches Laravel token TTL

export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  message: string;
  errors: Record<string, string[]>;
  meta: Record<string, unknown>;
}

/* ── Token storage ─────────────────────────────────────────────────────── */

export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function setToken(token: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(
    token
  )}; path=/; max-age=${TOKEN_MAX_AGE}; samesite=lax`;
}

export function clearToken(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function hasToken(): boolean {
  return getToken() !== null;
}

/* ── Envelope normalisation ───────────────────────────────────────────── */

/**
 * Laravel serialises Eloquent models in snake_case (`application_number`),
 * while every component in this app was written against Prisma's camelCase.
 * Convert object KEYS recursively so pages can keep their existing shapes
 * (`checkout_url` → `checkoutUrl`, `current_page` → `currentPage`, …).
 * Values are never touched. Idempotent for already-camelCase keys.
 */
function camelizeKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function camelize<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => camelize(v)) as unknown as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[camelizeKey(k)] = camelize(v);
    }
    return out as T;
  }
  return value;
}

/* ── Core request ──────────────────────────────────────────────────────── */

interface RequestOptions {
  method?: string;
  /** JSON body — serialized automatically. Mutually exclusive with `formData`. */
  body?: unknown;
  /** Multipart payload (file uploads). Content-Type is set by the browser. */
  formData?: FormData;
  /** Extra headers (merged after defaults). */
  headers?: Record<string, string>;
  /** Override the token (server components pass the cookie value). */
  token?: string | null;
}

/**
 * Perform a request against the Laravel API.
 * Never throws for HTTP errors — inspect `result.ok` / `result.errors`.
 */
export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResult<T>> {
  const { method = "GET", body, formData, headers = {}, token } = options;
  const auth = token !== undefined ? token : getToken();

  const finalHeaders: Record<string, string> = { ...headers };
  if (auth) finalHeaders.Authorization = `Bearer ${auth}`;
  let payload: BodyInit | undefined;
  if (formData) {
    payload = formData; // browser sets multipart boundary
  } else if (body !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  try {
    const res = await fetch(`${LARAVEL_API_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: payload,
      cache: "no-store",
    });

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      return {
        ok: res.ok,
        status: res.status,
        data: null,
        message: res.ok ? "OK" : `Unexpected response (${res.status})`,
        errors: {},
        meta: {},
      };
    }

    const json = (await res.json()) as Record<string, unknown>;
    return {
      ok: res.ok && json.ok !== false,
      status: res.status,
      data: (camelize(json.data as unknown) as T) ?? null,
      message:
        (json.message as string) ??
        (res.ok ? "OK" : `Request failed (${res.status})`),
    errors: (json.errors as Record<string, string[]>) ?? {},
    meta: (camelize(json.meta as Record<string, unknown>) as Record<string, unknown>) ?? {},
    };
  } catch (err) {
    console.error("[laravel-api] network error", path, err);
    return {
      ok: false,
      status: 0,
      data: null,
      message: "Network error — is the Laravel API running?",
      errors: {},
      meta: {},
    };
  }
}

/* ── Convenience helpers ───────────────────────────────────────────────── */

export const apiGet = <T = unknown>(path: string, token?: string | null) =>
  api<T>(path, { token });

export const apiPost = <T = unknown>(
  path: string,
  body?: unknown,
  token?: string | null
) => api<T>(path, { method: "POST", body, token });

export const apiPut = <T = unknown>(
  path: string,
  body?: unknown,
  token?: string | null
) => api<T>(path, { method: "PUT", body, token });

export const apiPatch = <T = unknown>(
  path: string,
  body?: unknown,
  token?: string | null
) => api<T>(path, { method: "PATCH", body, token });

export const apiDelete = <T = unknown>(path: string, token?: string | null) =>
  api<T>(path, { method: "DELETE", token });

/** POST a file upload (document store) with its metadata fields. */
export const apiUpload = <T = unknown>(
  path: string,
  formData: FormData,
  token?: string | null
) => api<T>(path, { method: "POST", formData, token });

/* ── Types shared with the Laravel API ─────────────────────────────────── */

export interface LaravelUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  phone?: string | null;
}

export interface LoginResponse {
  token: string;
  user: LaravelUser;
}

/** Compute the post-login landing page from the user's roles. */
export function homeForRoles(roles: string[]): string {
  if (roles.includes("SUPER_ADMIN")) return "/admin/dashboard";
  if (
    roles.some((r) =>
      [
        "ADMIN",
        "REGISTRAR",
        "ADMISSIONS_OFFICER",
        "ACADEMIC_OFFICER",
        "BURSARY_OFFICER",
        "HOD",
        "LECTURER",
      ].includes(r)
    )
  )
    return "/admin/dashboard";
  if (roles.includes("STUDENT")) return "/student/dashboard";
  if (roles.includes("APPLICANT")) return "/applicant/dashboard";
  return "/";
}
