import { withAuth, apiOk, parseBody, requireAdmin, HttpError } from "@/lib/api/handler";
import { aiModelCreateSchema, aiModelUpdateSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { aiModels, aiProviders, aiModelCapabilities, adminAuditLogs } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { bumpConfigVersion } from "@/lib/ai/router";
import { knownDefaultsFor } from "@/lib/ai/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(aiModels).orderBy(aiModels.displayName);
  const caps = await db.select().from(aiModelCapabilities);
  const capByModel = new Map<string, string[]>();
  for (const c of caps as any[]) {
    const list = capByModel.get(c.modelId) ?? [];
    if (c.supported) list.push(c.task);
    capByModel.set(c.modelId, list);
  }
  const data = rows.map((m: any) => ({ ...m, tasks: capByModel.get(m.id) ?? [] }));
  return apiOk({ models: data }, ctx.requestId);
});

export const POST = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const body = await parseBody(req, aiModelCreateSchema);
  const db = await getDb();
  const providerRows = await db.select().from(aiProviders).where(eq(aiProviders.id, body.providerId)).limit(1);
  const provider = providerRows[0];
  if (!provider) throw new HttpError(400, "provider_not_found", "Provider not found");

  const defaults = knownDefaultsFor(body.modelId);
  const explicitTasks = body.tasks;
  const tasks: string[] = (explicitTasks ?? defaults?.tasks ?? []) as string[];

  const [model] = await db.insert(aiModels).values({
    id: crypto.randomUUID(),
    providerId: body.providerId,
    name: body.name,
    modelId: body.modelId,
    displayName: body.displayName,
    contextWindow: body.contextWindow ?? defaults?.contextWindow ?? null,
    maxOutputTokens: body.maxOutputTokens ?? defaults?.maxOutputTokens ?? null,
    supportsStreaming: body.supportsStreaming ?? defaults?.supportsStreaming ?? false,
    supportsStructured: body.supportsStructured ?? defaults?.supportsStructured ?? false,
    supportsImages: body.supportsImages ?? defaults?.supportsImages ?? false,
    supportsEmbeddings: body.supportsEmbeddings ?? defaults?.supportsEmbeddings ?? false,
    enabled: body.enabled ?? true,
    priority: body.priority ?? 100,
    costPer1kInput: body.costPer1kInput ?? null,
    costPer1kOutput: body.costPer1kOutput ?? null,
  }).returning();

  for (const task of tasks) {
    await db.insert(aiModelCapabilities).values({ id: crypto.randomUUID(), modelId: model.id, task, supported: true });
  }

  await db.insert(adminAuditLogs).values({ id: crypto.randomUUID(), actorId: ctx.user!.id, action: "model.create", targetType: "ai_model", targetId: model.id, details: { name: model.name, tasks } });
  await bumpConfigVersion(ctx.user!.id, `model.create:${model.name}`);
  return apiOk({ model, tasks }, ctx.requestId);
});
