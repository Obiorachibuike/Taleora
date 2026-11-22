"use client";
/**
 * Browser-side API client.
 * Uses same-origin cookies (session) — requests carry credentials.
 */

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<{ ok: boolean; data: T; requestId?: string }> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const message = body?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, body?.error?.code ?? "unknown", message);
  }
  return { ok: true, data: body?.data ?? body, requestId: body?.requestId };
}

export function setTokens(_t: unknown) { /* no-op — cookies */ }

export function clearTokens() { /* no-op — cookies */ }

export function isAuthed(): boolean {
  return true; // session determined server-side; pages handle 401 gracefully
}

/** Build a FormData body with JSON fields serialized as JSON string fields. */
export function formDataFrom(obj: Record<string, any>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object") fd.append(k, JSON.stringify(v));
    else fd.append(k, String(v));
  }
  return fd;
}
