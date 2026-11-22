import { withAuth, apiOk, parseBody, requireAdmin, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { aiProviders, aiModels, aiModelHealth } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildAdapter } from "@/lib/ai/router";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ modelId: z.string().uuid().optional(), prompt: z.string().max(4000).default("Say hello in one short sentence."), task: z.string().optional() });

export const POST = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const body = await parseBody(req, schema);
  const db = await getDb();
  const providerRows = await db.select().from(aiProviders).where(eq(aiProviders.id, ctx.params.id)).limit(1);
  const provider = providerRows[0];
  if (!provider) throw new HttpError(404, "not_found", "Provider not found");
  if (!provider.isEnabled) throw new HttpError(400, "disabled", "Provider is disabled");

  let model: any;
  if (body.modelId) {
    model = (await db.select().from(aiModels).where(eq(aiModels.id, body.modelId)).limit(1))[0];
  } else {
    model = (await db.select().from(aiModels).where(eq(aiModels.providerId, provider.id)).limit(1))[0];
  }
  if (!model) throw new HttpError(404, "not_found", "No model configured for this provider");

  const adapter = buildAdapter(provider);
  const started = Date.now();
  try {
    const result = await adapter.generateText({ system: "You are a helpful writing assistant.", prompt: body.prompt, model: model.modelId ?? "", maxTokens: 200 });
    const latencyMs = Date.now() - started;
    await db.insert(aiModelHealth).values({ id: crypto.randomUUID(), modelId: model.id, providerId: provider.id, healthy: true, latencyMs });
    return apiOk({ ok: true, modelName: model.displayName, modelId: model.modelId, latencyMs, output: result.text.slice(0, 2000), tokensIn: result.tokensIn, tokensOut: result.tokensOut }, ctx.requestId);
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    await db.insert(aiModelHealth).values({ id: crypto.randomUUID(), modelId: model.id, providerId: provider.id, healthy: false, latencyMs, errorMessage: String(err).slice(0, 500) });
    return apiOk({ ok: false, modelName: model.displayName, error: err instanceof Error ? err.message : String(err), latencyMs }, ctx.requestId);
  }
});
