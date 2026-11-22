import { z } from "zod";
import { HUMANIZATION_MODES, HUMANIZATION_INTENSITIES, AI_TASKS, ADAPTER_TYPES, JOB_TYPES, EXPORT_FORMATS } from "@/shared/types";

// ─── Auth ──────────────────────────────────────────────────────────────────
export const emailSchema = z.string().trim().toLowerCase().email().max(320);
export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(256),
});
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(256),
});
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(1), newPassword: z.string().min(8).max(256) });
export const deleteAccountSchema = z.object({ password: z.string().min(1), name: z.string().min(2) });

// ─── Projects & stories ────────────────────────────────────────────────────
export const projectCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional(),
  genre: z.string().max(80).optional(),
  subgenres: z.array(z.string().max(60)).max(8).optional(),
  premise: z.string().max(8000).optional(),
  description2: z.string().max(4000).optional(),
  targetAudience: z.string().max(120).optional(),
  tone: z.string().max(80).optional(),
  pov: z.enum(["first", "second", "third-limited", "third-omniscient"]).optional(),
  language: z.string().max(10).optional(),
  targetChapters: z.number().int().min(1).max(500).optional(),
  targetWordsPerChapter: z.number().int().min(100).max(20000).optional(),
  totalWordTarget: z.number().int().min(100).max(500000).optional(),
  themes: z.array(z.string().max(80)).max(10).optional(),
  conflict: z.string().max(4000).optional(),
  endingGoal: z.string().max(2000).optional(),
  setting: z.string().max(2000).optional(),
});
export const projectUpdateSchema = projectCreateSchema.partial().extend({
  status: z.enum(["draft", "outline_review", "in_progress", "completed", "archived"]).optional(),
  version: z.number().int().optional(),
});

export const chapterCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(200000).default(""),
  index: z.number().int().min(0).optional(),
  version: z.number().int().optional(), // optimistic concurrency
});
export const chapterUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(200000).optional(),
  version: z.number().int().min(1),
});
export const outlineApproveSchema = z.object({ version: z.number().int().min(1).optional() });

export const outlineManualSchema = z.object({
  title: z.string().trim().max(200).optional(),
  logline: z.string().max(500).optional(),
  synopsis: z.string().max(4000).optional(),
  themes: z.array(z.string().max(80)).max(10).optional(),
  endingGoal: z.string().max(2000).optional(),
  chaptersMeta: z.array(z.object({
    index: z.number().int(),
    title: z.string().max(200),
    summary: z.string().max(2000),
    keyEvents: z.array(z.string().max(300)).max(10).optional(),
  })).max(500).optional(),
  status: z.enum(["draft", "approved", "edited"]).optional(),
});

// ─── Characters ────────────────────────────────────────────────────────────
export const characterCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  age: z.number().int().min(0).max(200).optional(),
  type: z.string().max(40).optional(),
  role: z.string().max(80).optional(),
  appearance: z.string().max(4000).optional(),
  personality: z.string().max(4000).optional(),
  background: z.string().max(8000).optional(),
  motivations: z.string().max(4000).optional(),
  strengths: z.array(z.string().max(200)).max(20).optional(),
  weaknesses: z.array(z.string().max(200)).max(20).optional(),
  fears: z.string().max(4000).optional(),
  goals: z.string().max(4000).optional(),
  speechPatterns: z.string().max(2000).optional(),
  developmentNotes: z.string().max(4000).optional(),
  importantEvents: z.array(z.string().max(500)).max(30).optional(),
  relationships: z.record(z.string(), z.string().max(4000)).optional(),
  version: z.number().int().optional(),
});

// ─── Humanization ──────────────────────────────────────────────────────────
export const humanizeSchema = z.object({
  text: z.string().trim().min(20).max(200000),
  mode: z.enum(HUMANIZATION_MODES).default("natural"),
  intensity: z.enum(HUMANIZATION_INTENSITIES).default("balanced"),
  projectId: z.string().uuid().optional(),
});

export const humanizeReRunSchema = z.object({
  mode: z.enum(HUMANIZATION_MODES).optional(),
  intensity: z.enum(HUMANIZATION_INTENSITIES).optional(),
});

export const humanizeAcceptRejectSchema = z.object({
  changeId: z.string().uuid().optional(),
  index: z.number().int().min(0).optional(),
  accepted: z.boolean(),
});

// ─── AI providers & models (admin) ──────────────────────────────────────────
export const aiProviderCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  adapterType: z.enum(ADAPTER_TYPES),
  baseUrl: z.string().url().max(500),
  apiKey: z.string().max(2000).optional().nullable(),
  isEnabled: z.boolean().optional(),
  description: z.string().max(2000).optional(),
  timeoutMs: z.number().int().min(1000).max(300000).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  options: z.record(z.unknown()).optional(),
});

export const aiProviderUpdateSchema = aiProviderCreateSchema.partial().extend({ apiKey: z.string().max(2000).optional().nullable(), isEnabled: z.boolean().optional() });

export const aiModelCreateSchema = z.object({
  providerId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  modelId: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200),
  contextWindow: z.number().int().min(0).max(10_000_000).optional(),
  maxOutputTokens: z.number().int().min(0).max(10_000_000).optional(),
  supportsStreaming: z.boolean().optional(),
  supportsStructured: z.boolean().optional(),
  supportsImages: z.boolean().optional(),
  supportsEmbeddings: z.boolean().optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  costPer1kInput: z.number().nonnegative().optional(),
  costPer1kOutput: z.number().nonnegative().optional(),
  tasks: z.array(z.enum(AI_TASKS)).max(AI_TASKS.length).optional(),
});

export const aiModelUpdateSchema = aiModelCreateSchema.partial().extend({ providerId: z.string().uuid().optional() });

export const aiAssignmentSchema = z.object({
  task: z.enum(AI_TASKS),
  modelId: z.string().uuid(),
  fallbackModelIds: z.array(z.string().uuid()).max(5).default([]),
  isDefault: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
});

export const healthCheckSchema = z.object({
  modelId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
}).refine((d) => d.modelId || d.providerId, { message: "modelId or providerId required" });

// ─── Publishing ────────────────────────────────────────────────────────────
export const publishSchema = z.object({
  visibility: z.enum(["unlisted", "public"]).default("unlisted"),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
});

// ─── Exports ───────────────────────────────────────────────────────────────
export const exportCreateSchema = z.object({
  format: z.enum(EXPORT_FORMATS),
  storyId: z.string().uuid().optional(),
});

// ─── Subscriptions ─────────────────────────────────────────────────────────
export const planUpdateSchema = z.object({
  code: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(1000).optional(),
  monthlyPriceCents: z.number().int().min(0).optional(),
  annualPriceCents: z.number().int().min(0).optional(),
  generationCredits: z.number().int().min(0).optional(),
  humanizationLimit: z.number().int().min(0).optional(),
  maxProjects: z.number().int().min(0).optional(),
  maxChapters: z.number().int().min(0).optional(),
  maxManuscriptWords: z.number().int().min(0).optional(),
  exportEnabled: z.boolean().optional(),
  features: z.array(z.string().max(60)).max(30).optional(),
  modelAccess: z.array(z.string().max(200)).max(30).optional(),
  durationDays: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

// ─── Jobs ──────────────────────────────────────────────────────────────────
export const chapterGenerationSchema = z.object({
  chapterIndex: z.number().int().min(0),
});
export const outlineGenerationSchema = z.object({}).default({});
export const characterGenerationSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  hints: z.string().max(2000).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type ChapterCreateInput = z.infer<typeof chapterCreateSchema>;
export type ChapterUpdateInput = z.infer<typeof chapterUpdateSchema>;
export type HumanizeInput = z.infer<typeof humanizeSchema>;
export type AIProviderCreateInput = z.infer<typeof aiProviderCreateSchema>;
export type AIModelCreateInput = z.infer<typeof aiModelCreateSchema>;
