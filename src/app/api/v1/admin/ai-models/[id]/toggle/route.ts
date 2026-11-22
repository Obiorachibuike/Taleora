import { withAuth, apiOk, requireAdmin, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { aiModels, adminAuditLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { bumpConfigVersion } from "@/lib/ai/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(aiModels).where(eq(aiModels.id, ctx.params.id)).limit(1);
  const model = rows[0];
  if (!model) throw new HttpError(404, "not_found", "Model not found");
  const [updated] = await db.update(aiModels).set({ enabled: !model.enabled, updatedAt: new Date() }).where(eq(aiModels.id, model.id)).returning();
  await db.insert(adminAuditLogs).values({ id: crypto.randomUUID(), actorId: ctx.user!.id, action: "model.toggle", targetType: "ai_model", targetId: model.id, details: { enabled: updated.enabled } });
  await bumpConfigVersion(ctx.user!.id, `model.toggle:${model.name}`);
  return apiOk({ model: updated }, ctx.requestId);
});
