import { NextResponse } from "next/server";
import { ZodError, z, type ZodSchema } from "zod";
import { getSessionWithUser, sessionTokenFromRequest, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { log, requestId } from "@/lib/logging";
import type { User } from "@/lib/db/schema";
import type { ApiResponse } from "@/shared/types";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = "HttpError";
  }
}

export function apiOk<T>(data: T, requestId: string): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ ok: true, data, requestId });
}

export function apiError(status: number, code: string, message: string, requestId: string, details?: unknown): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ ok: false, error: { code, message, details }, requestId }, { status });
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).host; } catch { return null; }
}

/** Wrap a route handler with auth, CSRF check and error normalization. */
export function withAuth(handler: (req: Request, ctx: AuthCtx) => Promise<Response>, opts?: { allowAnonymous?: boolean }) {
  return async (req: Request, nextContext?: any): Promise<Response> => {
    const rawParams = nextContext?.params ?? nextContext ?? {};
    const params = rawParams?.params ?? rawParams;
    const reqId = requestId();
    try {
      // CSRF: mutating requests must carry a trusted Origin/Referer.
      // "Trusted" = same host as the request (default) or an explicitly configured origin allowlist.
      if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
        const origin = req.headers.get("origin");
        const referer = req.headers.get("referer");
        const host = (req.headers.get("host") ?? new URL(req.url).host) || "";
        const originHost = hostOf(origin);
        const refHost = hostOf(referer);
        const serverHost = hostOf(`http://${host}`);
        const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL;
        const configuredHost = hostOf(configured ?? null);
        const allowedHosts = new Set([serverHost, configuredHost ?? undefined].filter(Boolean) as string[]);
        if (originHost || refHost) {
          const ok = allowedHosts.has(originHost ?? "") || allowedHosts.has(refHost ?? "");
          if (!ok) {
            return apiError(403, "csrf_failed", "Request origin is not trusted", reqId);
          }
        }
        // No Origin/Referer: safe-methods or non-browser clients are allowed
        // (e.g. server-to-server, curl). Session cookie auth still applies.
      }

      const token = sessionTokenFromRequest(req);
      const session = token ? await getSessionWithUser(token) : null;
      if (!session && !opts?.allowAnonymous) {
        return apiError(401, "unauthenticated", "Authentication required", reqId);
      }
      const user = session?.user ?? null;
      const ctx: AuthCtx = { user, sessionToken: token, params, requestId: reqId };
      return await handler(req, ctx);
    } catch (err: any) {
      if (err instanceof HttpError) {
        return apiError(err.status, err.code, err.message, reqId, err.details);
      }
      if (err instanceof ZodError) {
        return apiError(400, "validation_failed", "Invalid request body", reqId, err.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
      }
      const status = typeof err?.status === "number" ? err.status : 500;
      const code = typeof err?.code === "string" ? err.code : "internal_error";
      const message = status >= 500 ? "An unexpected error occurred" : err.message;
      if (status >= 500) log.error("route error", { err: String(err), requestId: reqId });
      return apiError(status, code, message, reqId);
    }
  };
}

export interface AuthCtx {
  user: User | null;
  sessionToken: string | null;
  params: any;
  requestId: string;
}

/** Parse and validate JSON body with zod. Throws HttpError(400) on failure. */
export async function parseBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues;
    throw new HttpError(400, "validation_failed", issues[0]?.message ?? "Invalid request body", issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return result.data as z.output<S>;
}

export function parseBodySync<S extends z.ZodTypeAny>(raw: unknown, schema: S): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new HttpError(400, "validation_failed", result.error.issues[0]?.message ?? "Invalid request body");
  return result.data as z.output<S>;
}

export function requireAdmin(user: User | null, roles?: ("ADMIN" | "SUPER_ADMIN")[]) {
  if (!user) throw new HttpError(401, "unauthenticated", "Authentication required");
  const allowed = roles ?? ["ADMIN", "SUPER_ADMIN"];
  if (!(allowed as string[]).includes(user.role)) {
    throw new HttpError(403, "forbidden", "Administrator access required");
  }
}

export function requireSuperAdmin(user: User | null) {
  if (!user) throw new HttpError(401, "unauthenticated", "Authentication required");
  if (user.role !== "SUPER_ADMIN") throw new HttpError(403, "forbidden", "Super admin access required");
}

export function requireOwnership(user: User | null, ownerId: string | null | undefined) {
  if (!user) throw new HttpError(401, "unauthenticated", "Authentication required");
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return;
  if (!ownerId || ownerId !== user.id) throw new HttpError(403, "forbidden", "You do not own this resource");
}

export function setSessionCookie(res: NextResponse, token: string | null) {
  if (token) {
    res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  }
}

export function jsonWithSession<T>(data: T, requestId: string, token: string | null): NextResponse<ApiResponse<T>> {
  const res = apiOk(data, requestId);
  if (token) setSessionCookie(res, token);
  return res;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions(), maxAge: 0 });
}
