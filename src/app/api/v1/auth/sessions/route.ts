import { withAuth, apiOk, HttpError } from "@/lib/api/handler";
import { listSessions, revokeSessionById } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const rows = await listSessions(ctx.user!.id);
  return apiOk({ sessions: rows }, ctx.requestId);
});

export const DELETE = withAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new HttpError(400, "validation_failed", "session id required");
  await revokeSessionById(ctx.user!.id, id);
  return apiOk({ revoked: true }, ctx.requestId);
});
