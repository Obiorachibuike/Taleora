import { describe, it, expect, beforeAll } from "vitest";
import { getDb, runMigrations } from "@/lib/db";
import { getUserEntitlements, assertCanCreateProject } from "@/lib/entitlements";
import { users, plans, subscriptions, creditAccounts, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("entitlements", () => {
  const userId = "22222222-2222-4222-8222-222222222222";

  beforeAll(async () => {
    await getDb();
    try { await runMigrations(); } catch { /* already applied */ }
    const db = await getDb();
    // seed the free plan
    await db.insert(plans).values({
      id: "33333333-3333-4333-8333-333333333333",
      code: "free", name: "Free", monthlyPriceCents: 0, annualPriceCents: 0,
      generationCredits: 20, humanizationLimit: 5, maxProjects: 2, maxChapters: 10,
      maxManuscriptWords: 5000, exportEnabled: false, features: [], modelAccess: [],
      sortOrder: 0, isActive: true,
    }).onConflictDoNothing();
    // seed user
    await db.insert(users).values({ id: userId, email: "entitlement-test@example.com", name: "Test User", passwordHash: "test", role: "USER", status: "ACTIVE" }).onConflictDoNothing();
    // seed free subscription + credits
    await db.insert(subscriptions).values({ id: "44444444-4444-4444-8444-444444444444", userId, planId: "33333333-3333-4333-8333-333333333333", status: "active", provider: "stripe", providerCustomerId: null, providerSubscriptionId: null, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30*24*60*60*1000) }).onConflictDoNothing();
    await db.insert(creditAccounts).values({ id: "55555555-5555-4555-8555-555555555555", userId, balance: 20, allocated: 0 }).onConflictDoNothing();
    // create 2 projects (at the limit)
    await db.insert(projects).values({ id: "66666666-6666-4666-8666-666666666661", userId, title: "P1", status: "draft" }).onConflictDoNothing();
    await db.insert(projects).values({ id: "66666666-6666-4666-8666-666666666662", userId, title: "P2", status: "draft" }).onConflictDoNothing();
  }, 60000);

  it("admin gets unlimited entitlements", async () => {
    const admin = { id: "99999999-9999-4999-8999-999999999999", email: "admin@example.com", name: "Admin", role: "ADMIN", status: "ACTIVE", passwordHash: "x", createdAt: new Date(), updatedAt: new Date() } as any;
    const e = await getUserEntitlements(admin);
    expect(e.planCode).toBe("admin");
    expect(e.credits).toBe(-1);
    expect(e.unlimitedProjects).toBe(true);
    expect(e.isAdmin).toBe(true);
  });

  it("free-tier user is limited to 2 projects", async () => {
    const db = await getDb();
    const u = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    const e = await getUserEntitlements(u as any);
    expect(e.maxProjects).toBe(2);
    await expect(assertCanCreateProject(u as any, 2)).rejects.toThrow();
  });
});
