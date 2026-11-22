/**
 * Seed script — creates default plans, Agnes AI provider + models, task assignments, and the first super admin.
 * Idempotent: safe to run repeatedly (onConflictDoNothing).
 *
 * Env:
 *   ADMIN_EMAIL, ADMIN_PASSWORD  — first SUPER_ADMIN credentials (required for admin seeding)
 *   AGNES_API_KEY, AGNES_BASE_URL, AGNES_DEFAULT_MODEL — for the default Agnes provider
 */
import "dotenv/config";
import { getDb, closeDb, runMigrations } from "@/lib/db";
import { plans, aiProviders, aiModels, aiModelCapabilities, aiModelAssignments, adminSettings, users, featureFlags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret, isEncryptionEnabled } from "@/lib/security/encryption";
import { hashPassword } from "@/lib/auth/password";
import { bumpConfigVersion } from "@/lib/ai/router";
import { KNOWN_MODEL_DEFAULTS } from "@/lib/ai/registry";

const DEFAULT_PLANS = [
  {
    code: "free", name: "Free", description: "Try Taleora — limited projects and generations.",
    monthlyPriceCents: 0, annualPriceCents: 0,
    generationCredits: 20, humanizationLimit: 5, maxProjects: 2, maxChapters: 10, maxManuscriptWords: 5000,
    exportEnabled: false, features: ["story-generation", "humanize"], modelAccess: [],
    durationDays: 30, sortOrder: 0,
  },
  {
    code: "starter", name: "Starter", description: "For emerging writers.",
    monthlyPriceCents: 1999, annualPriceCents: 19999,
    generationCredits: 200, humanizationLimit: 20, maxProjects: 10, maxChapters: 50, maxManuscriptWords: 40000,
    exportEnabled: true, features: ["story-generation", "humanize", "characters", "exports"], modelAccess: ["agnes-2.5-flash"],
    durationDays: 30, sortOrder: 1,
  },
  {
    code: "pro", name: "Pro", description: "For professional novelists and writers.",
    monthlyPriceCents: 4999, annualPriceCents: 49999,
    generationCredits: 1000, humanizationLimit: 100, maxProjects: 50, maxChapters: 200, maxManuscriptWords: 200000,
    exportEnabled: true, features: ["story-generation", "humanize", "characters", "exports", "memory", "publishing"], modelAccess: ["agnes-2.5-flash", "agnes-3.0-flash"],
    durationDays: 30, sortOrder: 2,
  },
  {
    code: "premium", name: "Premium", description: "Everything, including story memory and AI models.",
    monthlyPriceCents: 9999, annualPriceCents: 99999,
    generationCredits: 5000, humanizationLimit: 500, maxProjects: 200, maxChapters: 1000, maxManuscriptWords: 1000000,
    exportEnabled: true, features: ["story-generation", "humanize", "characters", "exports", "memory", "publishing", "ai-providers"], modelAccess: ["*"],
    durationDays: 30, sortOrder: 3,
  },
];

async function seedPlans(db: any) {
  for (const p of DEFAULT_PLANS) {
    await db.insert(plans).values({ id: crypto.randomUUID(), ...p, isActive: true }).onConflictDoNothing();
  }
  console.log(`[seed] plans ready (${DEFAULT_PLANS.length})`);
}

async function seedAgnes(db: any) {
  const existing = await db.select().from(aiProviders).where(eq(aiProviders.name, "Agnes AI")).limit(1);
  if (existing[0]) {
    console.log("[seed] Agnes AI provider already exists — skipping");
    return existing[0].id;
  }
  const apiKey = process.env.AGNES_API_KEY || null;
  const encrypted = apiKey && isEncryptionEnabled() ? encryptSecret(apiKey) : null;
  const [provider] = await db.insert(aiProviders).values({
    id: crypto.randomUUID(),
    name: "Agnes AI",
    adapterType: "agnes",
    baseUrl: process.env.AGNES_BASE_URL ?? "https://apihub.agnes-ai.com/v1",
    apiKeyEncrypted: encrypted,
    isEnabled: true,
    description: "Primary provider — Agnes AI (OpenAI-compatible). See docs/ai-provider-setup.md",
    timeoutMs: 60000,
    maxRetries: 3,
    healthStatus: "unknown",
  }).returning();

  // seed text + image models
  const textModelId = process.env.AGNES_DEFAULT_MODEL ?? "agnes-2.5-flash";
  const models = [
    { modelId: "agnes-3.0-flash", name: "agnes-3.0-flash", displayName: "Agnes 3.0 Flash", contextWindow: 512000, maxOutputTokens: 65536, supportsStreaming: true, supportsStructured: true },
    { modelId: "agnes-2.5-flash", name: "agnes-2.5-flash", displayName: "Agnes 2.5 Flash", contextWindow: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsStructured: true },
    { modelId: "agnes-2.0-flash", name: "agnes-2.0-flash", displayName: "Agnes 2.0 Flash", contextWindow: 64000, maxOutputTokens: 4096, supportsStreaming: true, supportsStructured: false },
    { modelId: "agnes-image-2.1-flash", name: "agnes-image-2.1-flash", displayName: "Agnes Image 2.1 Flash", supportsImages: true, supportsStreaming: false, supportsStructured: false },
  ];
  const modelIds = new Map<string, string>();
  for (const m of models) {
    const tasks = KNOWN_MODEL_DEFAULTS[m.modelId]?.tasks ?? [];
    const [model] = await db.insert(aiModels).values({
      id: crypto.randomUUID(),
      providerId: provider.id,
      name: m.name,
      modelId: m.modelId,
      displayName: m.displayName,
      contextWindow: m.contextWindow ?? null,
      maxOutputTokens: m.maxOutputTokens ?? null,
      supportsStreaming: m.supportsStreaming ?? false,
      supportsStructured: m.supportsStructured ?? false,
      supportsImages: m.supportsImages ?? false,
      supportsEmbeddings: false,
      enabled: true,
      priority: 100,
    }).returning();
    modelIds.set(m.modelId, model.id);
    for (const t of tasks) {
      await db.insert(aiModelCapabilities).values({ id: crypto.randomUUID(), modelId: model.id, task: t, supported: true });
    }
  }

  // Map tasks → default model (Agnes 2.5 flash for all text tasks, image model for IMAGE_GENERATION)
  const defaultTextModelId = modelIds.get("agnes-2.5-flash")!;
  const imageModelId = modelIds.get("agnes-image-2.1-flash")!;
  const textTasks = [
    "STORY_GENERATION", "NOVEL_GENERATION", "OUTLINE_GENERATION", "CHAPTER_GENERATION",
    "CONTINUE_WRITING", "HUMANIZATION", "DEEP_REWRITE", "DIALOGUE_ENHANCEMENT",
    "GRAMMAR_CORRECTION", "CHARACTER_GENERATION", "STORY_ANALYSIS", "MEMORY_EXTRACTION", "CONTINUITY_CHECK",
  ];
  for (const task of textTasks) {
    await db.insert(aiModelAssignments).values({
      id: crypto.randomUUID(),
      task,
      modelId: defaultTextModelId,
      isDefault: true,
      fallbackModelIds: [],
      isEnabled: true,
    }).onConflictDoNothing();
  }
  await db.insert(aiModelAssignments).values({
    id: crypto.randomUUID(),
    task: "IMAGE_GENERATION",
    modelId: imageModelId,
    isDefault: true,
    fallbackModelIds: [],
    isEnabled: true,
  }).onConflictDoNothing();

  await bumpConfigVersion(null, "seed:agnes-provider");
  console.log("[seed] Agnes AI provider + models + assignments ready");
  return provider.id;
}

async function seedAdmin(db: any) {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("[seed] ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin seeding");
    return;
  }
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) {
    console.log(`[seed] admin ${email} already exists — skipping`);
    return;
  }
  await db.insert(users).values({
    id: crypto.randomUUID(),
    email,
    name: "Administrator",
    passwordHash: await hashPassword(password),
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    emailVerifiedAt: new Date(),
  });
  console.log(`[seed] super admin ${email} created`);
}

async function seedFlags(db: any) {
  const flags = [
    { key: "experimental-ai-humanize", enabled: true, description: "Enable the AI humanizer" },
    { key: "experimental-story-generation", enabled: true, description: "Enable AI story generation" },
    { key: "experimental-exports", enabled: true, description: "Enable manuscript exports" },
    { key: "allow-cross-provider-fallback", enabled: false, description: "Allow cross-provider fallback (off by default — private content never crosses providers)" },
  ];
  for (const f of flags) {
    await db.insert(featureFlags).values({ id: crypto.randomUUID(), ...f }).onConflictDoNothing();
  }
  console.log(`[seed] feature flags ready`);
}

async function main() {
  console.log("[seed] running…");
  await getDb();
  try {
    await runMigrations();
    console.log("[seed] migrations applied");
  } catch (err) {
    console.error("[seed] migrations failed:", err instanceof Error ? err.message : err);
  }
  const db = await getDb();
  await seedPlans(db);
  await seedAgnes(db);
  await seedFlags(db);
  await seedAdmin(db);
  console.log("[seed] done");
  await closeDb();
  process.exit(0);
}

main().catch((err) => { console.error("[seed] fatal:", err); process.exit(1); });
