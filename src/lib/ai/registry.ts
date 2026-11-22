import type { AITask } from "@/shared/types";

export interface ModelCapabilityDefaults {
  /** Tasks this model can support (from known providers) */
  tasks: AITask[];
  supportsStreaming: boolean;
  supportsStructured: boolean;
  supportsImages: boolean;
  supportsEmbeddings: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
}

/**
 * Known-provider defaults. These are defaults — the admin dashboard (per-model
 * capability rows) is the authoritative source of truth and takes precedence.
 * Anything not listed here means the admin must assign capabilities explicitly
 * in the dashboard before the model can be used for a task.
 */
export const KNOWN_MODEL_DEFAULTS: Record<string, ModelCapabilityDefaults> = {
  // Agnes AI — text models (OpenAI-compatible chat completions)
  "agnes-3.0-flash": {
    tasks: ["STORY_GENERATION", "NOVEL_GENERATION", "OUTLINE_GENERATION", "CHAPTER_GENERATION", "CONTINUE_WRITING", "HUMANIZATION", "DEEP_REWRITE", "DIALOGUE_ENHANCEMENT", "GRAMMAR_CORRECTION", "CHARACTER_GENERATION", "STORY_ANALYSIS", "MEMORY_EXTRACTION", "CONTINUITY_CHECK"],
    supportsStreaming: true,
    supportsStructured: true,
    supportsImages: false,
    supportsEmbeddings: false,
    contextWindow: 512_000,
    maxOutputTokens: 65_536,
  },
  "agnes-2.5-flash": {
    tasks: ["STORY_GENERATION", "NOVEL_GENERATION", "OUTLINE_GENERATION", "CHAPTER_GENERATION", "CONTINUE_WRITING", "HUMANIZATION", "DEEP_REWRITE", "DIALOGUE_ENHANCEMENT", "GRAMMAR_CORRECTION", "CHARACTER_GENERATION", "STORY_ANALYSIS", "MEMORY_EXTRACTION", "CONTINUITY_CHECK"],
    supportsStreaming: true,
    supportsStructured: true,
    supportsImages: false,
    supportsEmbeddings: false,
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
  },
  "agnes-2.0-flash": {
    tasks: ["STORY_GENERATION", "OUTLINE_GENERATION", "CHAPTER_GENERATION", "CONTINUE_WRITING", "HUMANIZATION", "GRAMMAR_CORRECTION", "CHARACTER_GENERATION"],
    supportsStreaming: true,
    supportsStructured: false,
    supportsImages: false,
    supportsEmbeddings: false,
    contextWindow: 64_000,
    maxOutputTokens: 4_096,
  },
  "agnes-3.0-pro": {
    // coming soon — do not assume availability
    tasks: [],
    supportsStreaming: true,
    supportsStructured: true,
    supportsImages: false,
    supportsEmbeddings: false,
  },
  // Agnes AI — image models
  "agnes-image-2.0-flash": {
    tasks: ["IMAGE_GENERATION"],
    supportsStreaming: false,
    supportsStructured: false,
    supportsImages: true,
    supportsEmbeddings: false,
    contextWindow: 0,
    maxOutputTokens: 0,
  },
  "agnes-image-2.1-flash": {
    tasks: ["IMAGE_GENERATION"],
    supportsStreaming: false,
    supportsStructured: false,
    supportsImages: true,
    supportsEmbeddings: false,
    contextWindow: 0,
    maxOutputTokens: 0,
  },
  "agnes-image-2.5-flash": {
    tasks: ["IMAGE_GENERATION"],
    supportsStreaming: false,
    supportsStructured: false,
    supportsImages: true,
    supportsEmbeddings: false,
    contextWindow: 0,
    maxOutputTokens: 0,
  },
};

/** Lookup defaults for a known model; returns null for unknown models. */
export function knownDefaultsFor(modelId: string): ModelCapabilityDefaults | null {
  const normalized = modelId.trim().toLowerCase();
  if (KNOWN_MODEL_DEFAULTS[normalized]) return KNOWN_MODEL_DEFAULTS[normalized];
  // Prefix match (e.g. "agnes-2.5-flash-2026")
  for (const [key, value] of Object.entries(KNOWN_MODEL_DEFAULTS)) {
    if (normalized.startsWith(key)) return value;
  }
  return null;
}

/** Validate a task assignment against model capabilities. Throws if unsupported. */
export function validateTaskAssignment(tasks: AITask[], modelSupported: AITask[], task: AITask): void {
  if (!tasks.includes(task)) {
    throw new Error(`Model is not assigned to task ${task}`);
  }
  if (!modelSupported.includes(task)) {
    throw new Error(`Model does not support task ${task}`);
  }
}
