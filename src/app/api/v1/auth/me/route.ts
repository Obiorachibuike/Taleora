import { NextResponse } from "next/server";
import { withAuth, apiOk } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const u = ctx.user!;
  return apiOk({
    user: { id: u.id, email: u.email, name: u.name, role: u.role, emailVerifiedAt: u.emailVerifiedAt, avatarUrl: u.avatarUrl, bio: u.bio, website: u.website, locale: u.locale, timezone: u.timezone, createdAt: u.createdAt },
  }, ctx.requestId);
});
