import { getDb } from "@/lib/db";
import { aiProviders, aiModels, aiModelAssignments, aiModelCapabilities, aiModelHealth, aiModelUsage, adminSettings, aiModelConfigVersions } from "@/lib/db/schema";
import { eq, inArray, and, desc } from "drizzle-orm";
import type { AITask, AIProvider, GenerationRequest, GenerationResult, ImageGenerationRequest, ImageGenerationResult, HumanizationRequest, StreamChunk } from "@/shared/types";
import { decryptSecret } from "@/lib/security/encryption";
import { log } from "@/lib/logging";
import { validateProviderUrl } from "@/lib/security/ssrf";
import { makeAgnesAdapter } from "./adapters/agnes";
import { makeOpenAICompatibleAdapter } from "./adapters/openai-compatible-adapter";

// ─── Provider instantiation ─────────────────────────────────────────────────

export function buildAdapter(providerRow: { id: string; name: string; adapterType: string; baseUrl: string; apiKeyEncrypted: string | null; timeoutMs?: number | null; maxRetries?: number | null }): AIProvider {
  validateProviderUrl(providerRow.baseUrl, { allowLocalHttp: providerRow.baseUrl.startsWith("http://localhost") || providerRow.baseUrl.startsWith("http://127.0.0.1") });
  const apiKey = decryptSecret(providerRow.apiKeyEncrypted);
  const common = {
    id: providerRow.id,
    apiKey,
    timeoutMs: providerRow.timeoutMs ?? 60_000,
    maxRetries: providerRow.maxRetries ?? 2,
  };
  switch (providerRow.adapterType) {
    case "agnes":
      return makeAgnesAdapter({ ...common, name: providerRow.name, baseUrl: providerRow.baseUrl });
    case "openai-compatible":
    case "huggingface":
    case "anthropic-compatible":
      return makeOpenAICompatibleAdapter({ ...common, name: providerRow.name, baseUrl: providerRow.baseUrl });
    default:
      throw new Error(`Unsupported provider adapter type: ${providerRow.adapterType}`);
  }
}

export async function getProviderById(id: string): Promise<any | null> {
  const db = await getDb();
  const rows = await db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getModelById(id: string): Promise<any | null> {
  const db = await getDb();
  const rows = await db.select().from(aiModels).where(eq(aiModels.id, id)).limit(1);
  return rows[0] ?? null;
}

// ─── Capability registry ─────────────────────────────────────────────────────

export async function getModelTasks(modelId: string): Promise<AITask[]> {
  const db = await getDb();
  const rows = await db.select().from(aiModelCapabilities).where(and(eq(aiModelCapabilities.modelId, modelId), eq(aiModelCapabilities.supported, true)));
  return rows.map((r: any) => r.task as AITask);
}

export async function modelSupportsTask(modelId: string, task: AITask): Promise<boolean> {
  const tasks = await getModelTasks(modelId);
  return tasks.includes(task);
}

// ─── Versioned config snapshot ────────────────────────────────────────────────

export async function getConfigVersion(): Promise<number> {
  const db = await getDb();
  const rows = await db.select().from(adminSettings).where(eq(adminSettings.key, "ai_config_version")).limit(1);
  const v = rows[0]?.value?.version;
  if (typeof v === "number") return v;
  return 1;
}

export async function bumpConfigVersion(changedBy: string | null, note: string): Promise<number> {
  const db = await getDb();
  const current = await getConfigVersion();
  const next = current + 1;
  await db.insert(adminSettings)
    .values({ key: "ai_config_version", value: { version: next, changedBy, note, changedAt: new Date().toISOString() } })
    .onConflictDoUpdate({ target: adminSettings.key, set: { value: { version: next, changedBy, note, changedAt: new Date().toISOString() }, updatedAt: new Date() } });
  await db.insert(aiModelConfigVersions).values({
    id: crypto.randomUUID(),
    scope: "global",
    providerId: null,
    modelId: null,
    config: { version: next, changedBy, note, changedAt: new Date().toISOString() },
    version: next,
    changedBy,
    note,
  });
  return next;
}

// ─── Health tracking ─────────────────────────────────────────────────────────

const HEALTH_CACHE_MS = 60_000;
const healthCache = new Map<string, { healthy: boolean; at: number; error?: string }>();

export async function recordHealth(modelId: string, providerId: string, healthy: boolean, latencyMs?: number, error?: string) {
  const db = await getDb();
  await db.insert(aiModelHealth).values({
    id: crypto.randomUUID(),
    modelId,
    providerId,
    healthy,
    latencyMs: latencyMs ?? null,
    errorMessage: error?.slice(0, 500) ?? null,
  });
  const provider = await getProviderById(providerId);
  if (provider) {
    await db.update(aiProviders).set({
      healthStatus: healthy ? "healthy" : "unhealthy",
      lastHealthCheckedAt: new Date(),
    }).where(eq(aiProviders.id, providerId));
  }
  healthCache.set(modelId, { healthy, at: Date.now(), error });
}

export async function isProviderHealthy(providerId: string, modelId?: string): Promise<{ healthy: boolean; error?: string }> {
  if (modelId) {
    const cached = healthCache.get(modelId);
    if (cached && Date.now() - cached.at < HEALTH_CACHE_MS) return { healthy: cached.healthy, error: cached.error };
  }
  const provider = await getProviderById(providerId);
  if (!provider) return { healthy: false, error: "Provider not found" };
  if (!provider.isEnabled) return { healthy: false, error: "Provider disabled" };
  // unhealthy-ish: only trust the fresh recorded health; do not call out on every request
  const db = await getDb();
  const rows = await db.select().from(aiModelHealth).where(eq(aiModelHealth.modelId, modelId ?? ("00000000-0000-0000-0000-000000000000"))).orderBy(desc(aiModelHealth.checkedAt)).limit(1);
  const row = rows[0];
  if (modelId && !row) {
    // no recorded health — allow attempt (the first real request will record it)
    return { healthy: true };
  }
  if (row) return { healthy: row.healthy, error: row.errorMessage ?? undefined };
  // no modelId — trust enabled flag (adapter will fail loudly on actual errors)
  return { healthy: true };
}

// ─── Usage recording ─────────────────────────────────────────────────────────

export async function recordUsage(input: { modelId: string; providerId: string; task?: AITask | string; tokensIn?: number; tokensOut?: number; latencyMs?: number; costEstimated?: number }) {
  try {
    const db = await getDb();
    await db.insert(aiModelUsage).values({
      id: crypto.randomUUID(),
      modelId: input.modelId,
      providerId: input.providerId,
      task: input.task ?? null,
      tokensIn: input.tokensIn ?? 0,
      tokensOut: input.tokensOut ?? 0,
      costEstimated: input.costEstimated ?? 0,
      latencyMs: input.latencyMs ?? null,
    });
  } catch (err) {
    log.warn("Failed to record usage", { err: String(err) });
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export interface RoutedResult<T> {
  result: T;
  model: string;
  modelId: string;
  providerId: string;
  providerName: string;
  configVersion: number;
  usage?: { tokensIn?: number; tokensOut?: number; latencyMs?: number; costEstimated?: number };
}

export class RouterError extends Error {
  constructor(message: string, public code: string, public status = 400) {
    super(message);
    this.name = "RouterError";
  }
}

export interface RouteRequest {
  task: AITask;
  modelId?: string; // pin to a specific model (admin/testing); otherwise assignment decides
  dataPrivacy?: "private" | "public";
  adminOverrides?: boolean; // admins may temporarily use un-assigned models
}

async function resolveAssignment(task: AITask, modelId?: string): Promise<{ modelId: string; fallbackIds: string[]; configVersion: number }> {
  const db = await getDb();
  const assignmentRows = await db.select().from(aiModelAssignments).where(and(eq(aiModelAssignments.task, task), eq(aiModelAssignments.isEnabled, true))).limit(1);
  const assignment = assignmentRows[0];
  if (!assignment && !modelId) {
    throw new RouterError(`No ${task} model is configured — admin must assign one in AI Providers & Models`, "assignment_missing", 503);
  }
  const configVersion = await getConfigVersion();
  const assigned = assignment?.modelId ?? modelId!;
  const finalId = modelId ?? assigned;
  const fallbacks = (assignment?.fallbackModelIds ?? []).filter((id: string) => id && id !== finalId);
  return { modelId: finalId, fallbackIds: fallbacks, configVersion };
}

async function assertModelReady(modelId: string, task: AITask): Promise<{ model: any; provider: any }> {
  const model = await getModelById(modelId);
  if (!model) throw new RouterError(`Model ${modelId} not found`, "model_not_found", 503);
  if (!model.enabled) throw new RouterError(`Model ${model.name} is disabled`, "model_disabled", 503);
  const provider = await getProviderById(model.providerId);
  if (!provider) throw new RouterError(`Provider for model ${model.name} not found`, "provider_not_found", 503);
  if (!provider.isEnabled) throw new RouterError(`Provider ${provider.name} is disabled`, "provider_disabled", 503);
  const tasks = await getModelTasks(modelId);
  if (!tasks.includes(task)) throw new RouterError(`Model ${model.name} does not support task ${task}`, "task_unsupported", 503);
  return { model, provider };
}

/** Execute a text generation through the configured model with fallback. */
export async function executeText(task: AITask, request: GenerationRequest, opts: { dataPrivacy?: "private" | "public"; modelId?: string } = {}): Promise<RoutedResult<GenerationResult> & { usage: { tokensIn?: number; tokensOut?: number } }> {
  const resolved = await resolveAssignment(task, opts.modelId);
  const configVersion = resolved.configVersion;
  const candidates = await sameProviderCandidates(resolved.modelId, resolved.fallbackIds);
  let lastError: unknown = null;
  for (const candidateId of candidates) {
    try {
      const { model, provider } = await assertModelReady(candidateId, task);
      const adapter = buildAdapter(provider);
      const providerHealthy = await isProviderHealthy(provider.id, candidateId);
      if (!providerHealthy.healthy) {
        log.warn("Provider unhealthy or disabled, trying next candidate", { provider: provider.name, model: model.name, err: providerHealthy.error });
        lastError = new RouterError(providerHealthy.error ?? "Provider unhealthy", "provider_unhealthy", 503);
        continue;
      }
      const started = Date.now();
      const result = await adapter.generateText({ ...request, model: model.modelId });
      const latencyMs = Date.now() - started;
      await recordUsage({ modelId: model.id, providerId: provider.id, task, tokensIn: result.tokensIn, tokensOut: result.tokensOut, latencyMs, costEstimated: estimateCost(model, result.tokensIn, result.tokensOut) });
      await recordHealth(model.id, provider.id, true, latencyMs);
      return {
        result,
        model: model.modelId,
        modelId: model.id,
        providerId: provider.id,
        providerName: provider.name,
        configVersion,
        usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut, latencyMs, costEstimated: estimateCost(model, result.tokensIn, result.tokensOut) },
      };
    } catch (err: any) {
      log.warn("Model attempt failed, trying fallback", { task, model: candidateId, err: String(err) });
      lastError = err;
      const model = await getModelById(candidateId).catch(() => null);
      if (model) await recordHealth(model.id, model.providerId, false, undefined, String(err)).catch(() => {});
      continue;
    }
  }
  const message = lastError instanceof Error ? lastError.message : "All configured models failed";
  throw new RouterError(message, "all_models_failed", 503);
}

/** Execute a structured generation. Falls back to prompt-engineering parse. */
export async function executeStructured<T>(task: AITask, request: GenerationRequest & { schemaDescription?: string }, opts: { dataPrivacy?: "private" | "public"; modelId?: string } = {}): Promise<{ data: T; raw?: unknown; providerName: string; model: string; configVersion: number }> {
  const resolved = await resolveAssignment(task, opts.modelId);
  const configVersion = resolved.configVersion;
  const candidates = [resolved.modelId, ...resolved.fallbackIds];
  let lastError: unknown = null;
  for (const candidateId of candidates) {
    try {
      const { model, provider } = await assertModelReady(candidateId, task);
      const adapter = buildAdapter(provider);
      const providerHealthy = await isProviderHealthy(provider.id, candidateId);
      if (!providerHealthy.healthy) {
        lastError = new RouterError(providerHealthy.error ?? "Provider unhealthy", "provider_unhealthy", 503);
        continue;
      }
      const started = Date.now();
      const out = await adapter.generateStructured<T>({ ...request, model: model.modelId });
      const latencyMs = Date.now() - started;
      await recordHealth(model.id, provider.id, true, latencyMs);
      await recordUsage({ modelId: model.id, providerId: provider.id, task, tokensIn: 0, tokensOut: 0, latencyMs });
      return { ...out, providerName: provider.name, model: model.modelId, configVersion };
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }
  throw new RouterError(lastError instanceof Error ? lastError.message : "All configured models failed", "all_models_failed", 503);
}

/** Execute humanization. */
export async function executeHumanize(task: AITask, request: HumanizationRequest, opts: { dataPrivacy?: "private" | "public"; modelId?: string } = {}) {
  const resolved = await resolveAssignment(task, opts.modelId);
  const configVersion = resolved.configVersion;
  const candidates = await sameProviderCandidates(resolved.modelId, resolved.fallbackIds);
  let lastError: unknown = null;
  for (const candidateId of candidates) {
    try {
      const { model, provider } = await assertModelReady(candidateId, task);
      const adapter = buildAdapter(provider);
      const providerHealthy = await isProviderHealthy(provider.id, candidateId);
      if (!providerHealthy.healthy) {
        lastError = new RouterError(providerHealthy.error ?? "Provider unhealthy", "provider_unhealthy", 503);
        continue;
      }
      const started = Date.now();
      const result = await adapter.humanizeText({ ...request, model: model.modelId } as any);
      const latencyMs = Date.now() - started;
      await recordHealth(model.id, provider.id, true, latencyMs);
      await recordUsage({ modelId: model.id, providerId: provider.id, task, tokensIn: result.usage?.tokensIn, tokensOut: result.usage?.tokensOut, latencyMs, costEstimated: estimateCost(model, result.usage?.tokensIn, result.usage?.tokensOut) });
      return { result, model: model.modelId, modelId: model.id, providerId: provider.id, providerName: provider.name, configVersion };
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }
  throw new RouterError(lastError instanceof Error ? lastError.message : "All configured models failed", "all_models_failed", 503);
}

/** Execute image generation (only when the model supports images). */
export async function executeImage(task: "IMAGE_GENERATION", request: ImageGenerationRequest, opts: { modelId?: string } = {}) {
  const resolved = await resolveAssignment(task, opts.modelId);
  const configVersion = resolved.configVersion;
  const candidates = await sameProviderCandidates(resolved.modelId, resolved.fallbackIds);
  let lastError: unknown = null;
  for (const candidateId of candidates) {
    try {
      const { model, provider } = await assertModelReady(candidateId, task);
      if (!model.supportsImages) throw new RouterError(`Model ${model.name} does not support image generation`, "image_not_supported", 503);
      const adapter = buildAdapter(provider);
      if (!adapter.generateImage) throw new RouterError("Provider has no image-generation capability", "image_not_supported", 503);
      const started = Date.now();
      const result = await adapter.generateImage({ ...request, model: model.modelId });
      const latencyMs = Date.now() - started;
      await recordHealth(model.id, provider.id, true, latencyMs);
      return { result, model: model.modelId, modelId: model.id, providerId: provider.id, providerName: provider.name, configVersion };
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }
  throw new RouterError(lastError instanceof Error ? lastError.message : "All configured models failed", "all_models_failed", 503);
}

/** Streaming variant — yields chunks from the first healthy configured model. */
export async function executeStreamText(task: AITask, request: GenerationRequest, opts: { dataPrivacy?: "private" | "public"; modelId?: string } = {}): Promise<{ model: string; providerId: string; providerName: string; chunks: AsyncIterable<StreamChunk> }> {
  const resolved = await resolveAssignment(task, opts.modelId);
  const candidates = await sameProviderCandidates(resolved.modelId, resolved.fallbackIds);
  let lastError: unknown = null;
  for (const candidateId of candidates) {
    try {
      const { model, provider } = await assertModelReady(candidateId, task);
      if (!model.supportsStreaming) throw new RouterError(`Model ${model.name} does not support streaming`, "streaming_not_supported", 503);
      const adapter = buildAdapter(provider);
      if (!adapter.streamText) throw new RouterError("Provider has no streaming support", "streaming_not_supported", 503);
      return { model: model.modelId, providerId: provider.id, providerName: provider.name, chunks: adapter.streamText({ ...request, model: model.modelId }) };
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }
  throw new RouterError(lastError instanceof Error ? lastError.message : "All configured models failed", "all_models_failed", 503);
}


/** Filter fallback list to same-provider candidates only — private manuscripts must never
 *  silently move to a different provider (no cross-provider fallback by default). */
async function sameProviderCandidates(firstId: string, fallbackIds: string[]): Promise<string[]> {
  const firstModel = await getModelById(firstId);
  if (!firstModel) return [firstId];
  const firstProvider = firstModel.providerId;
  const out = [firstId];
  for (const fid of fallbackIds) {
    try {
      const m = await getModelById(fid);
      if (m && m.providerId === firstProvider) out.push(fid);
    } catch { /* skip */ }
  }
  return out;
}

function estimateCost(model: { costPer1kInput: number | null; costPer1kOutput: number | null }, tokensIn?: number, tokensOut?: number) {
  const inC = tokensIn ?? 0;
  const outC = tokensOut ?? 0;
  return (inC / 1000) * (model.costPer1kInput ?? 0) + (outC / 1000) * (model.costPer1kOutput ?? 0);
}
