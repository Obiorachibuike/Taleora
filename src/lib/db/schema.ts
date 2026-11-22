import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterType, AITask, EXPORT_FORMATS as _EF, HUMANIZATION_MODES as _HM, HUMANIZATION_INTENSITIES as _HI } from "@/shared/types";

const now = () => new Date();

// ─── Shared column helpers ──────────────────────────────────────────────────
const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow().$onUpdate(now);

// ═════════════════════════════════════════════════════════════════════════════
// Users & authentication
// ═════════════════════════════════════════════════════════════════════════════

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: "date" }),
  name: text("name").notNull(),
  passwordHash: text("password_hash"), // null for OAuth-only accounts
  role: text("role").notNull().default("USER"), // USER | ADMIN | SUPER_ADMIN
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUSPENDED | DELETED
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  website: text("website"),
  locale: text("locale").notNull().default("en"),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (t) => [index("users_email_idx").on(t.email), index("users_status_idx").on(t.status)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: createdAt(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
}, (t) => [
  uniqueIndex("sessions_token_hash_uniq").on(t.tokenHash),
  index("sessions_user_idx").on(t.userId),
]);

export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  kind: text("kind").notNull(), // EMAIL_VERIFICATION | PASSWORD_RESET
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("verification_tokens_hash_uniq").on(t.tokenHash), index("verification_tokens_email_idx").on(t.email)]);

// ═════════════════════════════════════════════════════════════════════════════
// Billing: plans, subscriptions, credits
// ═════════════════════════════════════════════════════════════════════════════

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  monthlyPriceCents: integer("monthly_price_cents").notNull().default(0),
  annualPriceCents: integer("annual_price_cents").notNull().default(0),
  generationCredits: integer("generation_credits").notNull().default(20), // per cycle
  humanizationLimit: integer("humanization_limit").notNull().default(5), // per cycle
  maxProjects: integer("max_projects").notNull().default(2),
  maxChapters: integer("max_chapters").notNull().default(10),
  maxManuscriptWords: integer("max_manuscript_words").notNull().default(5000),
  exportEnabled: boolean("export_enabled").notNull().default(false),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  modelAccess: jsonb("model_access").$type<string[]>().notNull().default([]),
  durationDays: integer("duration_days").notNull().default(30),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("plans_code_uniq").on(t.code)]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => plans.id),
  status: text("status").notNull(), // trialing | active | past_due | canceled | expired
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true, mode: "date" }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: "date" }).notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  provider: text("provider").notNull().default("manual"), // paystack | stripe | manual
  providerSubscriptionId: text("provider_subscription_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("subscriptions_user_idx").on(t.userId), index("subscriptions_status_idx").on(t.status)]);

export const creditAccounts = pgTable("credit_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("credit_accounts_user_uniq").on(t.userId)]);

export const creditTransactions = pgTable("credit_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  type: text("type").notNull(), // grant | debit | refund | adjustment
  reason: text("reason").notNull(),
  reference: text("reference"),
  createdAt: createdAt(),
}, (t) => [index("credit_transactions_user_idx").on(t.userId), index("credit_transactions_reference_idx").on(t.reference)]);

// ═════════════════════════════════════════════════════════════════════════════
// Projects & writing
// ═════════════════════════════════════════════════════════════════════════════

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  genre: text("genre"),
  subgenres: jsonb("subgenres").$type<string[]>().notNull().default([]),
  premise: text("premise"),
  audience: text("audience"),
  tone: text("tone"),
  pov: text("pov"), // first | second | third-limited | third-omniscient
  language: text("language").notNull().default("en"),
  targetChapters: integer("target_chapters"),
  targetWordsPerChapter: integer("target_words_per_chapter"),
  totalWordTarget: integer("total_word_target"),
  themes: jsonb("themes").$type<string[]>().notNull().default([]),
  conflict: text("conflict"),
  endingGoal: text("ending_goal"),
  setting: text("setting"),
  status: text("status").notNull().default("draft"), // draft | outline_review | in_progress | completed | archived
  coverImageUrl: text("cover_image_url"),
  coverVersion: integer("cover_version").notNull().default(1),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (t) => [index("projects_user_idx").on(t.userId), index("projects_status_idx").on(t.status)]);

export const stories = pgTable("stories", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"), // draft | writing | completed | archived
  wordCount: integer("word_count").notNull().default(0),
  logline: text("logline"),
  synopsis: text("synopsis"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (t) => [uniqueIndex("stories_project_uniq").on(t.projectId)]);

export const chapters = pgTable("chapters", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  storyId: uuid("story_id").references(() => stories.id, { onDelete: "cascade" }),
  index: integer("index").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  wordCount: integer("word_count").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | generating | completed | failed | edited
  version: integer("version").notNull().default(1),
  generationJobId: uuid("generation_job_id"),
  summary: text("summary"),
  locked: boolean("locked").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (t) => [
  index("chapters_project_idx").on(t.projectId, t.index),
  index("chapters_story_idx").on(t.storyId),
]);

export const chapterVersions = pgTable("chapter_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  chapterId: uuid("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull().default("manual"), // generated | manual | humanized | ai_rewrite
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("chapter_versions_chapter_version_uniq").on(t.chapterId, t.version)]);

export const storyOutlines = pgTable("story_outlines", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  storyId: uuid("story_id").references(() => stories.id, { onDelete: "cascade" }),
  title: text("title"),
  logline: text("logline"),
  synopsis: text("synopsis"),
  themes: jsonb("themes").$type<string[]>().notNull().default([]),
  chaptersMeta: jsonb("chapters_meta").$type<Array<{ index: number; title: string; summary: string; keyEvents?: string[] }>>().notNull().default([]),
  characters: jsonb("characters").$type<Array<{ name: string; role?: string; description?: string }>>().notNull().default([]),
  endingGoal: text("ending_goal"),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"), // draft | approved | edited
  rawJson: jsonb("raw_json").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("story_outlines_project_uniq").on(t.projectId)]);

// ═════════════════════════════════════════════════════════════════════════════
// Characters
// ═════════════════════════════════════════════════════════════════════════════

export const characters = pgTable("characters", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  age: integer("age"),
  type: text("type").notNull().default("character"), // character | worldbuilder | other
  role: text("role"), // e.g. protagonist, antagonist
  appearance: text("appearance"),
  personality: text("personality"),
  background: text("background"),
  motivations: text("motivations"),
  strengths: jsonb("strengths").$type<string[]>().notNull().default([]),
  weaknesses: jsonb("weaknesses").$type<string[]>().notNull().default([]),
  fears: text("fears"),
  goals: text("goals"),
  speechPatterns: text("speech_patterns"),
  developmentNotes: text("development_notes"),
  importantEvents: jsonb("important_events").$type<string[]>().notNull().default([]),
  relationships: jsonb("relationships").$type<Record<string, string>>().notNull().default({}),
  portraitUrl: text("portrait_url"),
  portraitVersion: integer("portrait_version").notNull().default(1),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (t) => [index("characters_project_idx").on(t.projectId), index("characters_user_idx").on(t.userId)]);

export const characterRelationships = pgTable("character_relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  characterId: uuid("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  relatedCharacterId: uuid("related_character_id").references(() => characters.id, { onDelete: "cascade" }),
  relationshipType: text("relationship_type").notNull(),
  strength: real("strength"), // 0..1
  description: text("description"),
  createdAt: createdAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (t) => [index("character_relationships_project_idx").on(t.projectId)]);

// ═════════════════════════════════════════════════════════════════════════════
// Story memory
// ═════════════════════════════════════════════════════════════════════════════

export const storyMemories = pgTable("story_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // character|plot|timeline|location|world_rule|style|object|fact|thread|chapter_summary
  subject: text("subject"),
  content: text("content").notNull(),
  confidence: real("confidence").notNull().default(0.8),
  sourceChapterIndex: integer("source_chapter_index"),
  canonical: boolean("canonical").notNull().default(false),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (t) => [
  index("story_memories_project_kind_idx").on(t.projectId, t.kind),
]);

export const storyEvents = pgTable("story_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  timelineLabel: text("timeline_label"),
  summary: text("summary").notNull(),
  participants: jsonb("participants").$type<string[]>().notNull().default([]),
  sourceChapterIndex: integer("source_chapter_index"),
  createdAt: createdAt(),
}, (t) => [index("story_events_project_idx").on(t.projectId, t.sequence)]);

export const storyFacts = pgTable("story_facts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  fact: text("fact").notNull(),
  confidence: real("confidence").notNull().default(0.8),
  sourceChapterIndex: integer("source_chapter_index"),
  isCanonical: boolean("is_canonical").notNull().default(true),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (t) => [index("story_facts_project_idx").on(t.projectId)]);

export const storyTimelines = pgTable("story_timelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  chapterIndex: integer("chapter_index"),
  summary: text("summary"),
  createdAt: createdAt(),
}, (t) => [index("story_timelines_project_idx").on(t.projectId)]);

export const storySummaries = pgTable("story_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  chapterIndex: integer("chapter_index").notNull(),
  summary: text("summary").notNull(),
  themes: jsonb("themes").$type<string[]>().notNull().default([]),
  continuityFlags: jsonb("continuity_flags").$type<string[]>().notNull().default([]),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("story_summaries_project_chapter_uniq").on(t.projectId, t.chapterIndex)]);

export const memoryVersions = pgTable("memory_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  snapshotKind: text("snapshot_kind").notNull().default("memory"),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull().default({}),
  changedBy: text("changed_by"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("memory_versions_project_version_uniq").on(t.projectId, t.version)]);

// ═════════════════════════════════════════════════════════════════════════════
// Humanization
// ═════════════════════════════════════════════════════════════════════════════

export const humanizationJobs = pgTable("humanization_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  originalText: text("original_text").notNull(),
  mode: text("mode").notNull(),
  intensity: text("intensity").notNull(),
  status: text("status").notNull().default("pending"), // pending|processing|completed|failed|cancelled
  progress: integer("progress").notNull().default(0),
  currentStage: text("current_stage"),
  analysis: jsonb("analysis").$type<Record<string, unknown>>(),
  plan: jsonb("plan").$type<Record<string, unknown>>(),
  resultText: text("result_text"),
  changes: jsonb("changes").$type<Array<{ beforeText: string; afterText: string; type: string }>>().notNull().default([]),
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  wordCountBefore: integer("word_count_before").notNull().default(0),
  wordCountAfter: integer("word_count_after").notNull().default(0),
  chunkCount: integer("chunk_count").notNull().default(0),
  completedChunks: integer("completed_chunks").notNull().default(0),
  errorMessage: text("error_message"),
  cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
}, (t) => [index("humanization_jobs_user_idx").on(t.userId), index("humanization_jobs_status_idx").on(t.status)]);

export const humanizationVersions = pgTable("humanization_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => humanizationJobs.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  text: text("text").notNull(),
  source: text("source").notNull().default("ai"), // ai | manual | restore
  createdAt: createdAt(),
}, (t) => [uniqueIndex("humanization_versions_job_version_uniq").on(t.jobId, t.version)]);

export const humanizationChunks = pgTable("humanization_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => humanizationJobs.id, { onDelete: "cascade" }),
  index: integer("index").notNull(),
  stableKey: text("stable_key").notNull(),
  text: text("text").notNull(),
  charCount: integer("char_count").notNull(),
  status: text("status").notNull().default("pending"), // pending | processing | completed | failed
  retriedCount: integer("retried_count").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("humanization_chunks_job_index_uniq").on(t.jobId, t.index)]);

export const humanizationChanges = pgTable("humanization_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => humanizationJobs.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  type: text("type").notNull(), // paragraph | sentence | word
  beforeText: text("before_text").notNull(),
  afterText: text("after_text").notNull(),
  accepted: boolean("accepted"), // null = unreviewed
  createdAt: createdAt(),
}, (t) => [index("humanization_changes_job_idx").on(t.jobId)]);

// ═════════════════════════════════════════════════════════════════════════════
// AI operations
// ═════════════════════════════════════════════════════════════════════════════

export const generationJobs = pgTable("generation_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  storyId: uuid("story_id").references(() => stories.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "cascade" }),
  jobType: text("job_type").notNull(),
  status: text("status").notNull().default("QUEUED"),
  provider: text("provider"),
  model: text("model"),
  configVersion: integer("config_version"),
  progress: integer("progress").notNull().default(0),
  currentStage: text("current_stage"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb("result").$type<Record<string, unknown>>(),
  dedupeKey: text("dedupe_key"),
  idempotencyKey: text("idempotency_key"),
  createdAt: createdAt(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  canceledAt: timestamp("canceled_at", { withTimezone: true, mode: "date" }),
}, (t) => [
  index("generation_jobs_status_idx").on(t.status, t.createdAt),
  index("generation_jobs_user_idx").on(t.userId),
  uniqueIndex("generation_jobs_idempotency_uniq").on(t.idempotencyKey),
]);

export const generationJobEvents = pgTable("generation_job_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => generationJobs.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  eventType: text("event_type").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("generation_job_events_job_seq_uniq").on(t.jobId, t.seq)]);

export const aiProviders = pgTable("ai_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  adapterType: text("adapter_type").notNull(), // agnes | openai-compatible | anthropic-compatible | huggingface
  baseUrl: text("base_url").notNull(),
  apiKeyEncrypted: text("api_key_encrypted"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  description: text("description"),
  timeoutMs: integer("timeout_ms").notNull().default(60000),
  maxRetries: integer("max_retries").notNull().default(3),
  options: jsonb("options").$type<Record<string, unknown>>().notNull().default({}),
  healthStatus: text("health_status").notNull().default("unknown"),
  lastHealthCheckedAt: timestamp("last_health_checked_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("ai_providers_name_uniq").on(t.name)]);

export const aiModels = pgTable("ai_models", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id").notNull().references(() => aiProviders.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  modelId: text("model_id").notNull(),
  displayName: text("display_name").notNull(),
  contextWindow: integer("context_window"),
  maxOutputTokens: integer("max_output_tokens"),
  supportsStreaming: boolean("supports_streaming").notNull().default(false),
  supportsStructured: boolean("supports_structured").notNull().default(false),
  supportsImages: boolean("supports_images").notNull().default(false),
  supportsEmbeddings: boolean("supports_embeddings").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  costPer1kInput: real("cost_per_1k_input"),
  costPer1kOutput: real("cost_per_1k_output"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("ai_models_provider_idx").on(t.providerId)]);

export const aiModelCapabilities = pgTable("ai_model_capabilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: uuid("model_id").notNull().references(() => aiModels.id, { onDelete: "cascade" }),
  task: text("task").notNull(),
  supported: boolean("supported").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("ai_model_capabilities_model_task_uniq").on(t.modelId, t.task)]);

export const aiModelAssignments = pgTable("ai_model_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  task: text("task").notNull(),
  modelId: uuid("model_id").notNull().references(() => aiModels.id, { onDelete: "cascade" }),
  isDefault: boolean("is_default").notNull().default(true),
  fallbackModelIds: jsonb("fallback_model_ids").$type<string[]>().notNull().default([]),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("ai_model_assignments_task_uniq").on(t.task)]);

export const aiModelHealth = pgTable("ai_model_health", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: uuid("model_id").notNull().references(() => aiModels.id, { onDelete: "cascade" }),
  providerId: uuid("provider_id").notNull().references(() => aiProviders.id, { onDelete: "cascade" }),
  checkedAt: timestamp("checked_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  healthy: boolean("healthy").notNull(),
  latencyMs: integer("latency_ms"),
  errorMessage: text("error_message"),
}, (t) => [index("ai_model_health_model_idx").on(t.modelId, t.checkedAt)]);

export const aiModelUsage = pgTable("ai_model_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: uuid("model_id").notNull().references(() => aiModels.id, { onDelete: "cascade" }),
  providerId: uuid("provider_id").references(() => aiProviders.id, { onDelete: "cascade" }),
  task: text("task"),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  costEstimated: real("cost_estimated").notNull().default(0),
  latencyMs: integer("latency_ms"),
  createdAt: createdAt(),
}, (t) => [index("ai_model_usage_model_idx").on(t.modelId, t.createdAt)]);

export const aiModelConfigVersions = pgTable("ai_model_config_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: text("scope").notNull(), // provider | model | assignment | health
  providerId: uuid("provider_id").references(() => aiProviders.id, { onDelete: "cascade" }),
  modelId: uuid("model_id").references(() => aiModels.id, { onDelete: "cascade" }),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  version: integer("version").notNull(),
  changedBy: text("changed_by"),
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [index("ai_model_config_versions_scope_idx").on(t.scope, t.version)]);

// ═════════════════════════════════════════════════════════════════════════════
// Administration
// ═════════════════════════════════════════════════════════════════════════════

export const adminSettings = pgTable("admin_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("admin_settings_key_uniq").on(t.key)]);

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
}, (t) => [index("admin_audit_logs_actor_idx").on(t.actorId, t.createdAt)]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
}, (t) => [index("audit_logs_actor_idx").on(t.actorId, t.createdAt)]);

export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description"),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("feature_flags_key_uniq").on(t.key)]);

// ═════════════════════════════════════════════════════════════════════════════
// Billing & assets
// ═════════════════════════════════════════════════════════════════════════════

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  provider: text("provider").notNull(), // paystack | stripe | manual
  reference: text("reference").notNull(),
  providerPaymentId: text("provider_payment_id"),
  amount: integer("amount").notNull(), // minor units
  currency: text("currency").notNull().default("NGN"),
  status: text("status").notNull().default("pending"),
  subscriptionId: text("subscription_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("payments_reference_uniq").on(t.reference), index("payments_user_idx").on(t.userId)]);

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  kind: text("kind").notNull(), // cover | portrait | illustration | export | avatar | document
  provider: text("provider").notNull(), // cloudinary | local
  url: text("url").notNull(),
  key: text("key"),
  fileName: text("file_name"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (t) => [index("files_user_idx").on(t.userId), index("files_project_idx").on(t.projectId)]);

export const publicStories = pgTable("public_stories", {
  id: uuid("id").primaryKey().defaultRandom(),
  storyId: uuid("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  visibility: text("visibility").notNull().default("unlisted"), // unlisted | public
  title: text("title").notNull(),
  description: text("description"),
  coverUrl: text("cover_url"),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("public_stories_story_uniq").on(t.storyId), uniqueIndex("public_stories_slug_uniq").on(t.slug)]);

export const exportJobs = pgTable("export_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  storyId: uuid("story_id").references(() => stories.id, { onDelete: "cascade" }),
  format: text("format").notNull(), // pdf | docx | epub | txt
  status: text("status").notNull().default("pending"), // pending | processing | completed | failed
  progress: integer("progress").notNull().default(0),
  fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
  errorMessage: text("error_message"),
  createdAt: createdAt(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
}, (t) => [index("export_jobs_user_idx").on(t.userId), index("export_jobs_project_idx").on(t.projectId)]);

// ═════════════════════════════════════════════════════════════════════════════
// Type exports
// ═════════════════════════════════════════════════════════════════════════════

export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type CreditAccount = typeof creditAccounts.$inferSelect;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Story = typeof stories.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type ChapterVersion = typeof chapterVersions.$inferSelect;
export type StoryOutline = typeof storyOutlines.$inferSelect;
export type Character = typeof characters.$inferSelect;
export type StoryMemory = typeof storyMemories.$inferSelect;
export type StoryEvent = typeof storyEvents.$inferSelect;
export type StoryFact = typeof storyFacts.$inferSelect;
export type StoryTimeline = typeof storyTimelines.$inferSelect;
export type StorySummary = typeof storySummaries.$inferSelect;
export type HumanizationJob = typeof humanizationJobs.$inferSelect;
export type HumanizationVersion = typeof humanizationVersions.$inferSelect;
export type HumanizationChunk = typeof humanizationChunks.$inferSelect;
export type GenerationJob = typeof generationJobs.$inferSelect;
export type GenerationJobEvent = typeof generationJobEvents.$inferSelect;
export type AIProviderRow = typeof aiProviders.$inferSelect;
export type AIModelRow = typeof aiModels.$inferSelect;
export type AIModelAssignmentRow = typeof aiModelAssignments.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type PublicStoryRow = typeof publicStories.$inferSelect;
export type ExportJobRow = typeof exportJobs.$inferSelect;
export type AdminAuditLogRow = typeof adminAuditLogs.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
export type FeatureFlagRow = typeof featureFlags.$inferSelect;

// Type-only re-exports for convenience
export type { AdapterType, AITask };
