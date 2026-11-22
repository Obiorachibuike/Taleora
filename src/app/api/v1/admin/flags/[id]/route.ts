import { withAuth, apiOk, parseBody, requireAdmin, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { featureFlags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const body = await parseBody(req, z.object({ enabled: z.boolean().optional(), description: z.string().max(500).optional() }));
  const db = await getDb();
  const rows = await db.select().from(featureFlags).where(eq(featureFlags.id, ctx.params.id)).limit(1);
  const flag = rows[0];
  if (!flag) throw new HttpError(404, "not_found", "Feature flag not found");
  const [updated] = await db.update(featureFlags).set({ enabled: body.enabled ?? flag.enabled, description: body.description ?? flag.description, updatedAt: new Date() }).where(eq(featureFlags.id, flag.id)).returning();
  return apiOk({ flag: updated }, ctx.requestId);
});
