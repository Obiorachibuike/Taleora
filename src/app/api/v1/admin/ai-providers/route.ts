import { withAuth, apiOk, parseBody, requireAdmin, HttpError } from "@/lib/api/handler";
import { aiProviderCreateSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { aiProviders, adminAuditLogs } from "@/lib/db/schema";
import { encryptSecret, isEncryptionEnabled } from "@/lib/security/encryption";
import { validateProviderUrl } from "@/lib/security/ssrf";
import { bumpConfigVersion } from "@/lib/ai/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(aiProviders).orderBy(aiProviders.name);
  // never return raw encrypted keys
  const data = (rows as any[]).map((p) => ({ ...p, apiKeyEncrypted: p.apiKeyEncrypted ? "[stored]" : null }));
  return apiOk({ providers: data }, ctx.requestId);
});

export const POST = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const body = await parseBody(req, aiProviderCreateSchema);

  const check = validateProviderUrl(body.baseUrl, { allowPrivate: false });
  if (!check.ok) throw new HttpError(400, "invalid_url", check.reason ?? "Invalid provider URL");

  const db = await getDb();
  const encrypted = body.apiKey && isEncryptionEnabled() ? encryptSecret(body.apiKey) : null;
  const [row] = await db.insert(aiProviders).values({
    id: crypto.randomUUID(),
    name: body.name,
    adapterType: body.adapterType,
    baseUrl: check.normalized ?? body.baseUrl,
    apiKeyEncrypted: encrypted,
    isEnabled: body.isEnabled ?? true,
    description: body.description ?? null,
    timeoutMs: body.timeoutMs ?? 60000,
    maxRetries: body.maxRetries ?? 3,
    options: (body.options ?? {}) as any,
    healthStatus: "unknown",
  }).returning();

  await db.insert(adminAuditLogs).values({ id: crypto.randomUUID(), actorId: ctx.user!.id, action: "provider.create", targetType: "ai_provider", targetId: row.id, details: { name: row.name, adapterType: row.adapterType } });
  await bumpConfigVersion(ctx.user!.id, `provider.create:${row.name}`);
  return apiOk({ provider: { ...row, apiKeyEncrypted: null }, encryptionWarning: isEncryptionEnabled() ? null : "AI_CONFIG_ENCRYPTION_KEY not set — API key will not be persisted securely" }, ctx.requestId);
});
