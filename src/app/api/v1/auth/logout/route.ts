import { NextResponse } from "next/server";
import { withAuth, apiOk, clearSessionCookie } from "@/lib/api/handler";
import { revokeSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  await revokeSession(ctx.sessionToken);
  const res = NextResponse.json({ ok: true, data: { loggedOut: true } });
  clearSessionCookie(res);
  return res;
});
