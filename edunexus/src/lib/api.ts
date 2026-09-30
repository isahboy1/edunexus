import { NextResponse } from "next/server";

// Standard API response envelope for all /api/v1 endpoints
// ok() accepts either ok(data, message) or ok(data, metaObject)
export function ok<T>(
  data: T,
  messageOrMeta: string | Record<string, unknown> = "OK",
  meta: Record<string, unknown> = {}
) {
  const message = typeof messageOrMeta === "string" ? messageOrMeta : "OK";
  const realMeta = typeof messageOrMeta === "string" ? meta : messageOrMeta;
  return NextResponse.json({
    success: true,
    message,
    data,
    meta: realMeta,
  });
}

export function created<T>(data: T, message = "Created successfully") {
  return NextResponse.json(
    { success: true, message, data },
    { status: 201 }
  );
}

export function fail(
  message: string,
  status = 400,
  errors?: Record<string, string[]>
) {
  return NextResponse.json(
    { success: false, message, errors: errors ?? {} },
    { status }
  );
}

export const unauthorized = (msg = "Authentication required") => fail(msg, 401);
export const forbidden = (msg = "You do not have permission to perform this action") => fail(msg, 403);
export const notFound = (msg = "Resource not found") => fail(msg, 404);
export const serverError = (msg = "An unexpected error occurred") => fail(msg, 500);

// Wrap a route handler with consistent error handling.
// Any error carrying a numeric `status` property (HttpError, AuthError, …) is
// reported with that status; everything else is a 500.
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err: unknown) {
    console.error("[api-error]", err);
    if (err instanceof HttpError) return fail(err.message, err.status);
    const status = (err as { status?: unknown })?.status;
    if (typeof status === "number" && status >= 400 && status <= 599) {
      return fail((err as Error).message ?? "Request failed", status);
    }
    return serverError();
  }
}

export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Flatten a Zod safeParse failure into the API errors object
export function zodErrors(parsed: {
  error: { issues: readonly { path: PropertyKey[]; message: string }[] };
}): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}
