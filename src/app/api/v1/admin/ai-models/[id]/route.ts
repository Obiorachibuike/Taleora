import { withAuth, apiOk, parseBody, requireAdmin, HttpError } from "@/lib/api/handler";
import { aiModelUpdateSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { aiModels, aiModelCapabilities, adminAuditLogs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { bumpConfigVersion } from "@/lib/ai/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const body = await parseBody(req, aiModelUpdateSchema);
  const db = await getDb();
  const rows = await db.select().from(aiModels).where(eq(aiModels.id, ctx.params.id)).limit(1);
  const model = rows[0];
  if (!model) throw new HttpError(404, "not_found", "Model not found");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of ["name", "modelId", "displayName", "contextWindow", "maxOutputTokens", "supportsStreaming", "supportsStructured", "supportsImages", "supportsEmbeddings", "enabled", "priority", "costPer1kInput", "costPer1kOutput"] as const) {
    if ((body as any)[f] !== undefined) updates[f] = (body as any)[f];
  }
  const [updated] = await db.update(aiModels).set(updates).where(eq(aiModels.id, model.id)).returning();

  // update capability set
  if (body.tasks !== undefined) {
    await db.delete(aiModelCapabilities).where(eq(aiModelCapabilities.modelId, model.id));
    for (const task of body.tasks) {
      await db.insert(aiModelCapabilities).values({ id: crypto.randomUUID(), modelId: model.id, task, supported: true });
    }
  }

  await db.insert(adminAuditLogs).values({ id: crypto.randomUUID(), actorId: ctx.user!.id, action: "model.update", targetType: "ai_model", targetId: model.id, details: { changedKeys: Object.keys(updates) } });
  await bumpConfigVersion(ctx.user!.id, `model.update:${model.name}`);
  return apiOk({ model: updated, tasks: body.tasks }, ctx.requestId);
});

export const DELETE = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(aiModels).where(eq(aiModels.id, ctx.params.id)).limit(1);
  const model = rows[0];
  if (!model) throw new HttpError(404, "not_found", "Model not found");
  await db.update(aiModels).set({ enabled: false, updatedAt: new Date() }).where(eq(aiModels.id, model.id));
  await db.insert(adminAuditLogs).values({ id: crypto.randomUUID(), actorId: ctx.user!.id, action: "model.disable", targetType: "ai_model", targetId: model.id, details: { name: model.name } });
  await bumpConfigVersion(ctx.user!.id, `model.disable:${model.name}`);
  return apiOk({ disabled: true }, ctx.requestId);
});
