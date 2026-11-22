import { OpenAICompatAdapter } from "./openai-compatible";

/** Generic OpenAI-compatible provider (covers OpenAI, Hugging Face's OpenAI-compatible host,
 *  and any other service that speaks the same protocol).
 *  Do NOT assume a service follows this protocol unless it documents it. */
export class OpenAICompatProviderAdapter extends OpenAICompatAdapter {
  constructor(cfg: { id: string; name?: string; baseUrl: string; apiKey: string | null; timeoutMs?: number; maxRetries?: number }) {
    super({ ...cfg, id: cfg.id, name: cfg.name ?? "OpenAI-compatible" });
  }
}

export function makeOpenAICompatibleAdapter(cfg: { id: string; baseUrl: string; apiKey: string | null; timeoutMs?: number; maxRetries?: number; name?: string }) {
  return new OpenAICompatProviderAdapter(cfg);
}
