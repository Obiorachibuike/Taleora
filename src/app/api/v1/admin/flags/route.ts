import { withAuth, apiOk, requireAdmin, parseBody } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { featureFlags } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(featureFlags).orderBy(asc(featureFlags.key));
  return apiOk({ flags: rows }, ctx.requestId);
});

export const POST = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const body = await parseBody(req, z.object({ key: z.string().trim().min(1).max(80), description: z.string().max(500).optional(), enabled: z.boolean().default(false) }));
  const db = await getDb();
  const [row] = await db.insert(featureFlags).values({ id: crypto.randomUUID(), key: body.key, enabled: body.enabled, description: body.description ?? null }).onConflictDoNothing().returning();
  return apiOk({ flag: row ?? null, created: !!row }, ctx.requestId);
});
