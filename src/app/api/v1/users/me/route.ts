import { withAuth, apiOk } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/handler";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withAuth(async (req, ctx) => {
  const body = await parseBody(req, z.object({
    name: z.string().min(1).max(120).optional(),
    bio: z.string().max(2000).optional(),
    website: z.string().max(300).optional(),
    locale: z.string().max(10).optional(),
    timezone: z.string().max(60).optional(),
    avatarUrl: z.string().max(500).optional(),
  }));
  const db = await getDb();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.bio !== undefined) updates.bio = body.bio;
  if (body.website !== undefined) updates.website = body.website;
  if (body.locale !== undefined) updates.locale = body.locale;
  if (body.timezone !== undefined) updates.timezone = body.timezone;
  if (body.avatarUrl !== undefined && body.avatarUrl !== null && body.avatarUrl !== "") {
    // allow http(s) URLs and our own /avatars/ paths only — never raw data URLs from this endpoint
    const u = body.avatarUrl.trim();
    if (!/^https?:\/\//.test(u) && !/^\/avatars\//.test(u)) throw new (await import("@/lib/api/handler")).HttpError(400, "validation_failed", "avatarUrl must be http(s) or /avatars/ path");
    updates.avatarUrl = u;
  } else if (body.avatarUrl === null || body.avatarUrl === "") {
    updates.avatarUrl = null;
  }
  const [updated] = await db.update(users).set(updates).where(eq(users.id, ctx.user!.id)).returning();
  return apiOk({ user: sanitize(updated) }, ctx.requestId);
});

export const GET = withAuth(async (req, ctx) => {
  return apiOk({ user: sanitize(ctx.user!) }, ctx.requestId);
});

function sanitize(u: any) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, avatarUrl: u.avatarUrl, bio: u.bio, website: u.website, locale: u.locale, timezone: u.timezone, emailVerifiedAt: u.emailVerifiedAt };
}
