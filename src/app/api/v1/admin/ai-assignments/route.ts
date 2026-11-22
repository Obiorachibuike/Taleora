import { withAuth, apiOk, parseBody, requireAdmin, HttpError } from "@/lib/api/handler";
import { aiAssignmentSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { aiModelAssignments, aiModels, aiModelCapabilities, adminAuditLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { bumpConfigVersion } from "@/lib/ai/router";
import { getModelTasks } from "@/lib/ai/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(aiModelAssignments);
  const models = await db.select().from(aiModels);
  const capRows = await db.select().from(aiModelCapabilities);
  const capByModel = new Map<string, string[]>();
  for (const c of capRows as any[]) {
    const list = capByModel.get(c.modelId) ?? [];
    if (c.supported) list.push(c.task);
    capByModel.set(c.modelId, list);
  }
  const modelById = new Map(models.map((m: any) => [m.id, m]));
  const data = rows.map((a: any) => ({ ...a, model: modelById.get(a.modelId) ?? null, modelTasks: capByModel.get(a.modelId) ?? [] }));
  return apiOk({ assignments: data }, ctx.requestId);
});

export const POST = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const body = await parseBody(req, aiAssignmentSchema);
  const db = await getDb();
  const modelRows = await db.select().from(aiModels).where(eq(aiModels.id, body.modelId)).limit(1);
  const model = modelRows[0];
  if (!model) throw new HttpError(404, "not_found", "Model not found");
  if (!model.enabled) throw new HttpError(400, "model_disabled", "Model is disabled");
  // capability validation — never assign a model to a task it doesn't support
  const tasks = await getModelTasks(model.id);
  if (!tasks.includes(body.task)) throw new HttpError(400, "task_unsupported", `Model ${model.displayName} does not support task ${body.task}`);

  for (const fid of (body.fallbackModelIds ?? [])) {
    if (fid === model.id) continue;
    const m = (await db.select().from(aiModels).where(eq(aiModels.id, fid)).limit(1))[0];
    if (!m) throw new HttpError(400, "model_not_found", `Fallback model ${fid} not found`);
    if (!m.enabled) throw new HttpError(400, "model_disabled", `Fallback model ${m.displayName} is disabled`);
    const fTasks = await getModelTasks(m.id);
    if (!fTasks.includes(body.task)) throw new HttpError(400, "task_unsupported", `Fallback model ${m.displayName} does not support task ${body.task}`);
    // only same-provider fallbacks allowed — never silently move private manuscripts to another provider
    if (m.providerId !== model.providerId) throw new HttpError(400, "cross_provider_fallback_forbidden", "Fallback models must be in the same provider");
  }

  const existing = await db.select().from(aiModelAssignments).where(eq(aiModelAssignments.task, body.task)).limit(1);
  let row;
  if (existing[0]) {
    [row] = await db.update(aiModelAssignments).set({
      modelId: body.modelId,
      fallbackModelIds: body.fallbackModelIds ?? [],
      isDefault: body.isDefault ?? true,
      isEnabled: body.isEnabled ?? true,
      updatedAt: new Date(),
    }).where(eq(aiModelAssignments.id, existing[0].id)).returning();
  } else {
    [row] = await db.insert(aiModelAssignments).values({
      id: crypto.randomUUID(),
      task: body.task,
      modelId: body.modelId,
      fallbackModelIds: body.fallbackModelIds ?? [],
      isDefault: body.isDefault ?? true,
      isEnabled: body.isEnabled ?? true,
    }).returning();
  }

  await db.insert(adminAuditLogs).values({ id: crypto.randomUUID(), actorId: ctx.user!.id, action: "assignment.upsert", targetType: "assignment", targetId: row.id, details: { task: body.task, modelId: body.modelId } });
  await bumpConfigVersion(ctx.user!.id, `assignment.upsert:${body.task}`);
  return apiOk({ assignment: row }, ctx.requestId);
});
