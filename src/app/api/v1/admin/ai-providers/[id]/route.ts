import { withAuth, apiOk, parseBody, requireAdmin, HttpError } from "@/lib/api/handler";
import { aiProviderUpdateSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { aiProviders, adminAuditLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret, isEncryptionEnabled } from "@/lib/security/encryption";
import { validateProviderUrl } from "@/lib/security/ssrf";
import { bumpConfigVersion } from "@/lib/ai/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(aiProviders).where(eq(aiProviders.id, ctx.params.id)).limit(1);
  const provider = rows[0];
  if (!provider) throw new HttpError(404, "not_found", "Provider not found");
  return apiOk({ provider: { ...provider, apiKeyEncrypted: provider.apiKeyEncrypted ? "[stored]" : null } }, ctx.requestId);
});

export const PATCH = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const body = await parseBody(req, aiProviderUpdateSchema);
  const db = await getDb();
  const rows = await db.select().from(aiProviders).where(eq(aiProviders.id, ctx.params.id)).limit(1);
  const provider = rows[0];
  if (!provider) throw new HttpError(404, "not_found", "Provider not found");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.adapterType !== undefined) updates.adapterType = body.adapterType;
  if (body.baseUrl !== undefined) {
    const check = validateProviderUrl(body.baseUrl, { allowPrivate: false });
    if (!check.ok) throw new HttpError(400, "invalid_url", check.reason ?? "Invalid provider URL");
    updates.baseUrl = check.normalized ?? body.baseUrl;
  }
  if (body.description !== undefined) updates.description = body.description;
  if (body.isEnabled !== undefined) updates.isEnabled = body.isEnabled;
  if (body.timeoutMs !== undefined) updates.timeoutMs = body.timeoutMs;
  if (body.maxRetries !== undefined) updates.maxRetries = body.maxRetries;
  if (body.options !== undefined) updates.options = body.options;
  if (body.apiKey !== undefined) {
    if (body.apiKey) {
      if (!isEncryptionEnabled()) throw new HttpError(500, "encryption_not_configured", "AI_CONFIG_ENCRYPTION_KEY is required to store an API key");
      updates.apiKeyEncrypted = encryptSecret(body.apiKey);
    } else {
      updates.apiKeyEncrypted = null;
    }
  }

  const [updated] = await db.update(aiProviders).set(updates).where(eq(aiProviders.id, provider.id)).returning();
  await db.insert(adminAuditLogs).values({ id: crypto.randomUUID(), actorId: ctx.user!.id, action: "provider.update", targetType: "ai_provider", targetId: provider.id, details: { changedKeys: Object.keys(updates).filter(k => k !== "updatedAt") } });
  await bumpConfigVersion(ctx.user!.id, `provider.update:${provider.name}`);
  return apiOk({ provider: { ...updated, apiKeyEncrypted: null } }, ctx.requestId);
});

export const DELETE = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(aiProviders).where(eq(aiProviders.id, ctx.params.id)).limit(1);
  const provider = rows[0];
  if (!provider) throw new HttpError(404, "not_found", "Provider not found");
  await db.update(aiProviders).set({ isEnabled: false, updatedAt: new Date() }).where(eq(aiProviders.id, provider.id));
  await db.insert(adminAuditLogs).values({ id: crypto.randomUUID(), actorId: ctx.user!.id, action: "provider.disable", targetType: "ai_provider", targetId: provider.id, details: { name: provider.name } });
  await bumpConfigVersion(ctx.user!.id, `provider.disable:${provider.name}`);
  return apiOk({ disabled: true }, ctx.requestId);
});
