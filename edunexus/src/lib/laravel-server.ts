import { cookies } from "next/headers";
import { api, TOKEN_COOKIE, type ApiResult } from "@/lib/laravel";

/**
 * Server-component flavour of the Laravel client: reads the Sanctum bearer
 * token from the request cookie and forwards it. Same envelope unwrapping
 * and snake→camel normalisation as the browser client.
 */
export async function serverApi<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<ApiResult<T>> {
  const store = await cookies();
  const token = store.get(TOKEN_COOKIE)?.value ?? null;
  if (!token) {
    return {
      ok: false,
      status: 401,
      data: null,
      message: "Not signed in.",
      errors: {},
      meta: {},
    };
  }
  return api<T>(path, { ...options, token });
}
