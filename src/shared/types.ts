/**
 * Shared types and constants for Taleora.
 * These are imported by server code, API routes and (type-only) client components.
 */

export const USER_ROLES = ["USER", "ADMIN", "SUPER_ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "SUSPENDED", "DELETED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const JOB_STATUSES = ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_TYPES = [
  "STORY_GENERATION",
  "OUTLINE_GENERATION",
  "CHAPTER_GENERATION",
  "CONTINUE_WRITING",
  "HUMANIZATION",
  "CHARACTER_GENERATION",
  "STORY_ANALYSIS",
  "MEMORY_EXTRACTION",
  "CONTINUITY_CHECK",
  "COVER_GENERATION",
  "DOCUMENT_EXPORT",
] as const;
export type GenerationJobType = (typeof JOB_TYPES)[number];

export const AI_TASKS = [
  "STORY_GENERATION",
  "NOVEL_GENERATION",
  "OUTLINE_GENERATION",
  "CHAPTER_GENERATION",
  "CONTINUE_WRITING",
  "HUMANIZATION",
  "DEEP_REWRITE",
  "DIALOGUE_ENHANCEMENT",
  "GRAMMAR_CORRECTION",
  "CHARACTER_GENERATION",
  "STORY_ANALYSIS",
  "MEMORY_EXTRACTION",
  "CONTINUITY_CHECK",
  "TEXT_EMBEDDING",
  "IMAGE_GENERATION",
] as const;
export type AITask = (typeof AI_TASKS)[number];

export const ADAPTER_TYPES = [
  "agnes",
  "openai-compatible",
  "anthropic-compatible",
  "huggingface",
] as const;
export type AdapterType = (typeof ADAPTER_TYPES)[number];

export const HUMANIZATION_MODES = [
  "natural",
  "emotional",
  "literary",
  "conversational",
  "cinematic",
  "simple",
  "professional",
  "deep-rewrite",
] as const;
export type HumanizationMode = (typeof HUMANIZATION_MODES)[number];

export const HUMANIZATION_INTENSITIES = ["light", "balanced", "deep"] as const;
export type HumanizationIntensity = (typeof HUMANIZATION_INTENSITIES)[number];

export const EXPORT_FORMATS = ["pdf", "docx", "epub", "txt"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const PROVIDER_HEALTH = ["unknown", "healthy", "degraded", "unhealthy"] as const;
export type ProviderHealthStatus = (typeof PROVIDER_HEALTH)[number];

export const PAYSTACK_STATUSES = ["pending", "success", "failed"] as const;
export type PaymentStatus = (typeof PAYSTACK_STATUSES)[number];

export const DEFAULT_TEXT_TASKS: AITask[] = [
  "STORY_GENERATION",
  "NOVEL_GENERATION",
  "OUTLINE_GENERATION",
  "CHAPTER_GENERATION",
  "CONTINUE_WRITING",
  "HUMANIZATION",
  "DEEP_REWRITE",
  "DIALOGUE_ENHANCEMENT",
  "GRAMMAR_CORRECTION",
  "CHARACTER_GENERATION",
  "STORY_ANALYSIS",
  "MEMORY_EXTRACTION",
  "CONTINUITY_CHECK",
];

export const IMAGE_TASKS: AITask[] = ["IMAGE_GENERATION"];

// ─── API response envelope ──────────────────────────────────────────────────
export interface ApiSuccess<T> {
  ok: true;
  data: T;
  requestId: string;
}
export interface ApiFailure {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  requestId: string;
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const API_VERSION = "v1";

// ─── AI provider interface ──────────────────────────────────────────────────
export interface GenerationRequest {
  system?: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
  task?: AITask;
}

export interface GenerationResult {
  text: string;
  model: string;
  providerId: string;
  providerName: string;
  tokensIn?: number;
  tokensOut?: number;
  finishReason?: string;
  latencyMs?: number;
  raw?: unknown;
}

export interface StructuredGenerationRequest extends GenerationRequest {
  schemaDescription?: string;
}

export interface HumanizationRequest {
  text: string;
  mode: HumanizationMode;
  intensity: HumanizationIntensity;
  context?: {
    storyTitle?: string;
    premise?: string;
    genre?: string;
    characters?: string[];
    setting?: string;
    previousChapterSummary?: string;
    style?: string;
    pov?: string;
    timeline?: string[];
  };
  preservation?: string[];
}

export interface HumanizationResult {
  text: string;
  mode: HumanizationMode;
  intensity: HumanizationIntensity;
  warnings?: string[];
  notes?: string[];
  usage?: { tokensIn?: number; tokensOut?: number };
  model: string;
  providerId: string;
}

export interface StreamChunk {
  type: "text" | "usage" | "done" | "error";
  text?: string;
  tokensIn?: number;
  tokensOut?: number;
  error?: string;
}

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  size?: string;
  n?: number;
  negativePrompt?: string;
}

export interface ImageGenerationResult {
  url?: string;
  base64?: string;
  model: string;
  providerId: string;
  raw?: unknown;
}

export interface ProviderHealth {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  status?: ProviderHealthStatus;
}

export interface AIProvider {
  id: string;
  name: string;
  generateText(request: GenerationRequest): Promise<GenerationResult>;
  generateStructured<T>(request: StructuredGenerationRequest): Promise<{ data: T; raw?: unknown }>;
  humanizeText(request: HumanizationRequest): Promise<HumanizationResult>;
  imagesSupported?: boolean;
  generateImage?(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
  streamText?(request: GenerationRequest): AsyncIterable<StreamChunk>;
  checkHealth(): Promise<ProviderHealth>;
}

// ─── DB row helpers ─────────────────────────────────────────────────────────
export type Id = string;
export type IsoTimestamp = string;

export function uid(prefix = ""): string {
  const rand = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return prefix ? `${prefix}_${rand}` : rand;
}
