import { withAuth, apiOk, parseBody, requireAdmin, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { aiModels, aiProviders, aiModelHealth } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildAdapter } from "@/lib/ai/router";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ prompt: z.string().max(4000).default("Reply with exactly: OK") });

export const POST = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const body = await parseBody(req, schema);
  const db = await getDb();
  const modelRows = await db.select().from(aiModels).where(eq(aiModels.id, ctx.params.id)).limit(1);
  const model = modelRows[0];
  if (!model) throw new HttpError(404, "not_found", "Model not found");
  const providerRows = await db.select().from(aiProviders).where(eq(aiProviders.id, model.providerId)).limit(1);
  const provider = providerRows[0];
  if (!provider) throw new HttpError(404, "not_found", "Provider not found");
  if (!model.enabled) throw new HttpError(400, "model_disabled", "Model is disabled");
  if (!provider.isEnabled) throw new HttpError(400, "provider_disabled", "Provider is disabled");

  const adapter = buildAdapter(provider);
  const started = Date.now();
  try {
    const result = await adapter.generateText({ system: "You are a test harness.", prompt: body.prompt, model: model.modelId ?? "", maxTokens: 100 });
    const latencyMs = Date.now() - started;
    await db.insert(aiModelHealth).values({ id: crypto.randomUUID(), modelId: model.id, providerId: provider.id, healthy: true, latencyMs });
    return apiOk({ ok: true, modelId: model.modelId, output: result.text.slice(0, 2000), latencyMs, tokensIn: result.tokensIn, tokensOut: result.tokensOut }, ctx.requestId);
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    await db.insert(aiModelHealth).values({ id: crypto.randomUUID(), modelId: model.id, providerId: provider.id, healthy: false, latencyMs, errorMessage: String(err).slice(0, 500) });
    return apiOk({ ok: false, error: err instanceof Error ? err.message : String(err), latencyMs }, ctx.requestId);
  }
});
