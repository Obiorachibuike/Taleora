/**
 * Shared OpenAI-compatible transport for AI providers.
 * Used by Agnes (primary), OpenAI and Hugging Face (OpenAI-compatible host)
 * via different base URLs and model catalogs.
 *
 * No hardcoded models — the model id always comes from the configuration.
 */
import type { GenerationRequest, GenerationResult, StructuredGenerationRequest, StreamChunk, ImageGenerationRequest, ImageGenerationResult, ProviderHealth } from "@/shared/types";
import { validateProviderUrl } from "@/lib/security/ssrf";
import { log } from "@/lib/logging";

export class ProviderRequestError extends Error {
  constructor(message: string, public status?: number, public body?: string) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

export interface OpenAICompatConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string | null;
  timeoutMs?: number;
  maxRetries?: number;
  allowHttp?: boolean;
}

const MAX_BODY_LOG = 400;

export class OpenAICompatAdapter {
  id: string;
  name: string;
  protected baseUrl: string;
  protected apiKey: string | null;
  protected timeoutMs: number;
  protected maxRetries: number;

  constructor(config: OpenAICompatConfig) {
    const check = validateProviderUrl(config.baseUrl, { allowPrivate: process.env.NODE_ENV !== "production" && config.allowHttp === true, allowLocalHttp: config.allowHttp === true });
    if (!check.ok) {
      throw new ProviderRequestError(`Invalid provider URL: ${check.reason}`);
    }
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = check.normalized!;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.maxRetries = config.maxRetries ?? 2;
  }

  protected async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  protected authHeaders(): HeadersInit {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
    return headers;
  }

  private async request<T>(path: string, body: unknown, opts?: { retries?: number }): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const attempts = (opts?.retries ?? this.maxRetries) + 1;
    let lastErr: unknown = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await this.fetchWithTimeout(url, {
          method: "POST",
          headers: this.authHeaders(),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          // transient: 429, 500-599 → retry with backoff
          if (res.status === 429 || res.status >= 500) {
            lastErr = new ProviderRequestError(`Provider returned ${res.status}`, res.status, text.slice(0, MAX_BODY_LOG));
            await sleep(Math.min(1000 * Math.pow(2, i), 8000));
            continue;
          }
          // 4xx: permanent — do not retry
          throw new ProviderRequestError(`Provider returned ${res.status}`, res.status, text.slice(0, MAX_BODY_LOG));
        }
        const data = (await res.json()) as T;
        return data;
      } catch (err) {
        if (err instanceof ProviderRequestError) {
          // already classified 4xx permanent
          if (err.status !== undefined && err.status >= 400 && err.status < 500 && err.status !== 429) throw err;
          lastErr = err;
          await sleep(Math.min(1000 * Math.pow(2, i), 8000));
          continue;
        }
        lastErr = err;
        await sleep(Math.min(500 * Math.pow(2, i), 4000));
      }
    }
    throw lastErr instanceof Error ? lastErr : new ProviderRequestError("Provider request failed");
  }

  async generateText(request: GenerationRequest): Promise<GenerationResult> {
    const model = request.model ?? "";
    if (!model) throw new ProviderRequestError("No model configured for request");
    const body: Record<string, unknown> = {
      model,
      messages: buildMessages(request),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
    };
    if (request.stop?.length) body.stop = request.stop;
    const started = Date.now();
    const data = await this.request<any>("/chat/completions", body);
    const text = data?.choices?.[0]?.message?.content ?? "";
    const tokensIn = data?.usage?.prompt_tokens;
    const tokensOut = data?.usage?.completion_tokens;
    return {
      text: typeof text === "string" ? text : "",
      model,
      providerId: this.id,
      providerName: this.name,
      tokensIn,
      tokensOut,
      finishReason: data?.choices?.[0]?.finish_reason ?? undefined,
      latencyMs: Date.now() - started,
      raw: data,
    };
  }

  async generateStructured<T>(request: StructuredGenerationRequest): Promise<{ data: T; raw?: unknown }> {
    // Try JSON mode first (supported by Agnes / most OpenAI-compatible providers)
    const model = request.model ?? "";
    const messages = buildMessages(request);
    const fallbackPrompt = [
      "You MUST respond with a single JSON object.",
      "Do not wrap it in markdown fences. Do not add any prose before or after.",
    ].join(" ");
    messages.push({ role: "system", content: `${fallbackPrompt} Schema description: ${request.schemaDescription ?? "unknown"}` });

    const started = Date.now();
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? 8192,
      response_format: { type: "json_object" },
    };
    let data: any;
    try {
      data = await this.request<any>("/chat/completions", body);
    } catch (err) {
      // Some providers reject response_format — retry without it, then parse
      if (err instanceof ProviderRequestError && err.status === 400) {
        log.warn("response_format rejected, retrying without", { provider: this.name });
        delete body.response_format;
        data = await this.request<any>("/chat/completions", body);
      } else {
        throw err;
      }
    }
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonFromText(text);
    if (parsed === null) {
      throw new ProviderRequestError("Provider returned non-JSON content", 200, "parse_failure");
    }
    return {
      data: parsed as T,
      raw: { latencyMs: Date.now() - started, usage: data?.usage },
    };
  }

  async *streamText(request: GenerationRequest): AsyncIterable<StreamChunk> {
    const model = request.model ?? "";
    if (!model) throw new ProviderRequestError("No model configured for request");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { ...this.authHeaders(), Accept: "text/event-stream" },
        body: JSON.stringify({
          model,
          messages: buildMessages(request),
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 4096,
          stream: true,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        yield { type: "error", error: `Provider returned ${res.status}: ${text.slice(0, MAX_BODY_LOG)}` };
        return;
      }
      if (!res.body) {
        yield { type: "error", error: "No streaming body" };
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") { yield { type: "done" }; return; }
          try {
            const chunk = JSON.parse(payload);
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) yield { type: "text", text: delta };
          } catch {
            // ignore keep-alive chunks
          }
        }
      }
      yield { type: "done" };
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const model = request.model ?? "";
    if (!model) throw new ProviderRequestError("No model configured for request");
    const body: Record<string, unknown> = {
      model,
      prompt: request.prompt,
      n: request.n ?? 1,
    };
    if (request.size) body.size = request.size;
    if (request.negativePrompt) body.negative_prompt = request.negativePrompt;
    const started = Date.now();
    const data = await this.request<any>("/images/generations", body);
    const first = data?.data?.[0];
    const url = first?.url ?? first?.images?.[0]?.url;
    const b64 = first?.b64_json ?? first?.images?.[0]?.b64_json ?? first?.b64;
    return {
      url: typeof url === "string" ? url : undefined,
      base64: typeof b64 === "string" ? b64 : undefined,
      model,
      providerId: this.id,
      raw: { latencyMs: Date.now() - started, rawKeys: Object.keys(data ?? {}) },
    };
  }

  async humanizeText(request: import("@/shared/types").HumanizationRequest): Promise<import("@/shared/types").HumanizationResult> {
    // Humanization is modeled as a specialized generation call. The pipeline
    // layer produces the actual system prompt; the adapter just routes it.
    const prompt = buildHumanizationPrompt(request);
    const result = await this.generateText({ ...prompt.request, model: prompt.model ?? undefined });
    return {
      text: result.text,
      mode: request.mode,
      intensity: request.intensity,
      usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut },
      model: result.model,
      providerId: result.providerId,
    };
  }

  async checkHealth(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      // Minimal probe: most providers reject a tiny chat completion — that is a healthy signal.
      const model = "health-probe"; // placeholder — replaced by caller (router) or left to detect
      const res = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
        method: "GET",
        headers: { ...this.authHeaders(), Accept: "application/json" },
      }).catch(() => null);
      if (res) {
        const lat = Date.now() - started;
        if (res.status === 401 || res.status === 403) {
          return { healthy: false, latencyMs: lat, error: `Provider auth rejected (${res.status}) — check API key`, status: "unhealthy" };
        }
        if (res.ok) return { healthy: true, latencyMs: lat, status: "healthy" };
      }
      // Fallback: probe with a tiny chat completion if a model arg is available; else unhealthy
      return { healthy: false, latencyMs: Date.now() - started, error: "Provider health probe did not return a healthy response", status: "unhealthy" };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - started, error: err instanceof Error ? err.message : String(err), status: "unhealthy" };
    }
  }
}

function buildMessages(request: GenerationRequest): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  if (request.system) messages.push({ role: "system", content: request.system });
  messages.push({ role: "user", content: request.prompt });
  return messages;
}

/** Parse a JSON object out of a model response, tolerating markdown fences. */
export function parseJsonFromText(text: string): any | null {
  if (!text) return null;
  let trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  if (fence) trimmed = fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    trimmed = trimmed.slice(start, end + 1);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    try {
      // retry with repaired trailing commas
      const repaired = trimmed.replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Compose a humanization system prompt from the request.
 * The actual multi-stage pipeline (analysis → plan → rewrite → verify) lives in the
 * pipeline layer; this is the single-call fallback used when streaming is not required.
 */
export function buildHumanizationPrompt(request: import("@/shared/types").HumanizationRequest) {
  const modeGuide: Record<string, string> = {
    natural: "Rewrite in a natural, conversational voice. Keep the meaning and facts exactly as given.",
    emotional: "Rewrite with emotional resonance. Keep the meaning, facts, characters and plot intact.",
    literary: "Rewrite with literary elegance and imagery. Preserve all facts and meaning.",
    conversational: "Rewrite in a relaxed, natural, spoken-like voice. Keep facts identical.",
    cinematic: "Rewrite with vivid scene-setting, sensory detail and forward-moving tension. Preserve facts.",
    simple: "Rewrite in plain, clear, simple language. Keep every fact and named entity.",
    professional: "Rewrite in polished, formal professional prose. Preserve meaning and facts.",
    "deep-rewrite": "Substantively rewrite — vary rhythm, structure and expression — while preserving every fact, character name, relationship, timeline and intent.",
  };
  const intensityGuide: Record<string, string> = {
    light: "Light: fix awkward phrasing only; retain the original structure.",
    balanced: "Balanced: improve flow, readability, sentence variety and expression.",
    deep: "Deep: substantially revise while preserving meaning and facts.",
  };
  const preservation = (request.preservation ?? []).length
    ? `\n\nPRESERVE EXACTLY (verbatim): ${request.preservation!.join(" | ")}`
    : "\n\nPRESERVE: character names, place names, relationships, events, timeline, numbers, negation, key story facts and narrative perspective.";

  const ctxLines = request.context
    ? Object.entries(request.context).filter(([, v]) => v).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n")
    : "";

  const system = [
    "You are a professional literary editor. You humanise and rewrite text without changing any factual content.",
    "Never insert errors, quirks or stylistic gimmicks. Never add facts. Never invent events.",
    "Keep the original meaning and author intent intact. Surgical changes only.",
    modeGuide[request.mode] ?? modeGuide.natural,
    intensityGuide[request.intensity] ?? intensityGuide.balanced,
    preservation,
    ctxLines ? `CONTEXT:\n${ctxLines}` : "",
    "Output ONLY the rewritten text. No commentary, no labels, no markdown.",
  ].filter(Boolean).join("\n");

  return {
    request: {
      system,
      prompt: request.text,
      maxTokens: Math.max(2048, Math.ceil(request.text.length / 2.5)),
      temperature: request.intensity === "light" ? 0.3 : request.intensity === "deep" ? 0.8 : 0.6,
    } as GenerationRequest,
    model: undefined as string | undefined,
  };
}
