import { eq, and, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { plans, subscriptions, creditAccounts, creditTransactions, projects, type User } from "@/lib/db/schema";

export interface UserEntitlements {
  unlimitedProjects: boolean;
  unlimitedChapters: boolean;
  unlimitedGenerations: boolean;
  unlimitedHumanization: boolean;
  unlimitedExports: boolean;
  availableFeatures: string[];
  planCode: string;
  credits: number;
  humanizationUsedThisCycle: number;
  humanizationLimit: number;
  maxProjects: number;
  maxChapters: number;
  maxManuscriptWords: number;
  exportEnabled: boolean;
  modelAccess: string[];
  isAdmin: boolean;
  role: string;
}

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

/**
 * Compute entitlements server-side from the trusted role + subscription.
 * Admin (ADMIN / SUPER_ADMIN) always bypass ordinary quotas.
 * This is the ONLY source of entitlement decisions — the client never sees them.
 */
export async function getUserEntitlements(user: User): Promise<UserEntitlements> {
  const db = await getDb();
  const isAdmin = ADMIN_ROLES.has(user.role);

  if (isAdmin) {
    // Admins bypass quotas entirely, but track usage (logged elsewhere).
    return {
      unlimitedProjects: true,
      unlimitedChapters: true,
      unlimitedGenerations: true,
      unlimitedHumanization: true,
      unlimitedExports: true,
      availableFeatures: ["story-generation", "humanize", "characters", "exports", "memory", "publishing", "ai-providers"],
      planCode: "admin",
      credits: -1, // -1 = unlimited, treated specially
      humanizationUsedThisCycle: 0,
      humanizationLimit: -1,
      maxProjects: -1,
      maxChapters: -1,
      maxManuscriptWords: -1,
      exportEnabled: true,
      modelAccess: ["*"],
      isAdmin: true,
      role: user.role,
    };
  }

  const rows = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, user.id), inArray(subscriptions.status, ["trialing", "active", "past_due"]))).limit(1);
  const sub = rows[0];
  if (!sub) {
    return freeFallback();
  }
  const planRows = await db.select().from(plans).where(eq(plans.id, sub.planId)).limit(1);
  const plan = planRows[0];
  const creditRows = await db.select().from(creditAccounts).where(eq(creditAccounts.userId, user.id)).limit(1);
  const credits = creditRows[0]?.balance ?? 0;

  if (!plan) return freeFallback();

  const features = Array.isArray(plan.features) ? plan.features : [];
  return {
    unlimitedProjects: false,
    unlimitedChapters: false,
    unlimitedGenerations: false,
    unlimitedHumanization: false,
    unlimitedExports: plan.exportEnabled,
    availableFeatures: features,
    planCode: plan.code,
    credits,
    humanizationUsedThisCycle: 0, // tracked via credit_transactions reference counting elsewhere
    humanizationLimit: plan.humanizationLimit,
    maxProjects: plan.maxProjects,
    maxChapters: plan.maxChapters,
    maxManuscriptWords: plan.maxManuscriptWords,
    exportEnabled: plan.exportEnabled,
    modelAccess: Array.isArray(plan.modelAccess) ? plan.modelAccess : [],
    isAdmin: false,
    role: user.role,
  };
}

function freeFallback(): UserEntitlements {
  return {
    unlimitedProjects: false, unlimitedChapters: false, unlimitedGenerations: false,
    unlimitedHumanization: false, unlimitedExports: false,
    availableFeatures: ["story-generation", "humanize"],
    planCode: "free",
    credits: 0,
    humanizationUsedThisCycle: 0,
    humanizationLimit: 5,
    maxProjects: 2,
    maxChapters: 10,
    maxManuscriptWords: 5000,
    exportEnabled: false,
    modelAccess: [],
    isAdmin: false,
    role: "USER",
  };
}

export class EntitlementError extends Error {
  constructor(message: string, public code: string, public status = 402) {
    super(message);
    this.name = "EntitlementError";
  }
}

export async function assertCanCreateProject(user: User, existingProjectCount: number) {
  const ent = await getUserEntitlements(user);
  if (ent.unlimitedProjects) return ent;
  if (existingProjectCount >= ent.maxProjects) {
    throw new EntitlementError(`Your plan allows ${ent.maxProjects} project(s). Upgrade to create more.`, "project_limit");
  }
  return ent;
}

export async function assertCanCreateChapter(user: User, existingChapterCount: number) {
  const ent = await getUserEntitlements(user);
  if (ent.unlimitedChapters) return ent;
  if (existingChapterCount >= ent.maxChapters) {
    throw new EntitlementError(`Your plan allows ${ent.maxChapters} chapters. Upgrade to create more.`, "chapter_limit");
  }
  return ent;
}

export async function assertCreditsFor(user: User, cost: number, reference: string) {
  const ent = await getUserEntitlements(user);
  if (ent.unlimitedGenerations) return ent;
  if (ent.credits < cost) {
    throw new EntitlementError(`Insufficient credits (need ${cost}, have ${ent.credits}).`, "insufficient_credits");
  }
  return ent;
}

/** Deduct credits; returns true if deducted, false if admin/unlimited. */
export async function deductCredits(user: User, amount: number, reason: string, reference?: string): Promise<boolean> {
  const ent = await getUserEntitlements(user);
  if (ent.unlimitedGenerations) return false; // admin: never deduct
  const db = await getDb();
  const rows = await db.select().from(creditAccounts).where(eq(creditAccounts.userId, user.id)).limit(1);
  const account = rows[0];
  const current = account?.balance ?? 0;
  if (current < amount) throw new EntitlementError("Insufficient credits", "insufficient_credits");
  const newBalance = current - amount;
  await db.update(creditAccounts).set({ balance: newBalance }).where(eq(creditAccounts.userId, user.id)).catch(async () => {
    // create account if missing (race: should exist)
    await db.insert(creditAccounts).values({ id: crypto.randomUUID(), userId: user.id, balance: newBalance });
  });
  await db.insert(creditTransactions).values({
    id: crypto.randomUUID(),
    userId: user.id,
    amount: -amount,
    type: "debit",
    reason,
    reference: reference ?? null,
  });
  return true;
}

/** Grant credits (e.g. plan renewal bonus). */
export async function grantCredits(user: User, amount: number, reason: string, reference?: string) {
  const db = await getDb();
  const rows = await db.select().from(creditAccounts).where(eq(creditAccounts.userId, user.id)).limit(1);
  const current = rows[0]?.balance ?? 0;
  const newBalance = current + amount;
  if (rows[0]) {
    await db.update(creditAccounts).set({ balance: newBalance }).where(eq(creditAccounts.userId, user.id));
  } else {
    await db.insert(creditAccounts).values({ id: crypto.randomUUID(), userId: user.id, balance: newBalance });
  }
  await db.insert(creditTransactions).values({
    id: crypto.randomUUID(),
    userId: user.id,
    amount,
    type: "grant",
    reason,
    reference: reference ?? null,
  });
}

/** Check the humanization monthly limit for a non-admin user. */
export async function assertCanHumanize(user: User) {
  const ent = await getUserEntitlements(user);
  if (ent.unlimitedHumanization) return ent;
  // count this cycle's jobs (created within current cycle via subscription period)
  const db = await getDb();
  let cycleStart = new Date();
  const rows = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, user.id), inArray(subscriptions.status, ["trialing", "active", "past_due"]))).limit(1);
  if (rows[0]) cycleStart = rows[0].currentPeriodStart;
  const cntRows = await db.execute(
    // raw count via drizzle not-supported style; use query builder below
    // (kept simple: approximated as existing jobs since cycle start)
    (await import("drizzle-orm")).sql`select count(*)::int as c from humanization_jobs where user_id = ${user.id} and created_at >= ${cycleStart}`
  ) as any;
  const used = cntRows?.rows?.[0]?.c ?? cntRows?.[0]?.c ?? 0;
  if (used >= ent.humanizationLimit) {
    throw new EntitlementError(`Your plan allows ${ent.humanizationLimit} humanization job(s) this cycle.`, "humanization_limit");
  }
  return ent;
}
