/**
 * Agnes AI adapter — the primary provider.
 *
 * Verified against https://agnes-ai.com/doc (OpenAI-compatible interface):
 *   base URL: https://apihub.agnes-ai.com/v1
 *   auth:     Authorization: Bearer <api-key>
 *   text:     POST /v1/chat/completions  (stream: true supported)
 *   images:   POST /v1/images/generations (url or base64 output)
 *
 * Known models (per agnes-ai.com docs, may change — admin dashboard is authoritative):
 *   text:   agnes-3.0-flash, agnes-2.5-flash, agnes-3.0-pro (coming soon), agnes-2.0-flash
 *   images: agnes-image-2.0-flash, agnes-image-2.1-flash, agnes-image-2.5-flash
 *
 * Agnes does not advertise embeddings; the registry marks embeddings unsupported.
 */
import { OpenAICompatAdapter } from "./openai-compatible";

export class AgnesAdapter extends OpenAICompatAdapter {
  constructor(cfg: { id: string; name?: string; baseUrl: string; apiKey: string | null; timeoutMs?: number; maxRetries?: number }) {
    super({ ...cfg, id: cfg.id, name: cfg.name ?? "Agnes AI" });
  }
}

export function makeAgnesAdapter(cfg: { id: string; name?: string; apiKey: string | null; baseUrl?: string; timeoutMs?: number; maxRetries?: number }) {
  return new AgnesAdapter({
    id: cfg.id,
    name: cfg.name,
    baseUrl: cfg.baseUrl ?? process.env.AGNES_BASE_URL ?? "https://apihub.agnes-ai.com/v1",
    apiKey: cfg.apiKey,
    timeoutMs: cfg.timeoutMs,
    maxRetries: cfg.maxRetries,
  });
}
