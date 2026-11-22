import { withAuth, apiOk, requireAdmin, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { aiProviders, aiModelHealth, aiModelCapabilities, aiModels, adminAuditLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildAdapter, getModelById } from "@/lib/ai/router";
import { recordHealth } from "@/lib/ai/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(aiProviders).where(eq(aiProviders.id, ctx.params.id)).limit(1);
  const provider = rows[0];
  if (!provider) throw new HttpError(404, "not_found", "Provider not found");

  const modelRows = await db.select().from(aiModels).where(eq(aiModels.providerId, provider.id)).limit(5);
  const results: Array<Record<string, unknown>> = [];
  for (const m of modelRows) {
    try {
      const adapter = buildAdapter(provider);
      // health probe: cheap health check via tiny chat request if supported
      const probe = await adapter.checkHealth();
      await recordHealth(m.id, provider.id, probe.healthy, probe.latencyMs, probe.error);
      results.push({ modelId: m.id, modelName: m.name, healthy: probe.healthy, latencyMs: probe.latencyMs, error: probe.error ?? null });
    } catch (err: any) {
      await recordHealth(m.id, provider.id, false, undefined, String(err));
      results.push({ modelId: m.id, modelName: m.name, healthy: false, latencyMs: null, error: String(err) });
    }
  }
  await db.update(aiProviders).set({ healthStatus: results.every((r) => r.healthy) ? "healthy" : "degraded", lastHealthCheckedAt: new Date() }).where(eq(aiProviders.id, provider.id));
  await db.insert(adminAuditLogs).values({ id: crypto.randomUUID(), actorId: ctx.user!.id, action: "provider.health_check", targetType: "ai_provider", targetId: provider.id, details: { modelCount: results.length } });
  return apiOk({ providerId: provider.id, results }, ctx.requestId);
});
