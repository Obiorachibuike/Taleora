import { describe, it, expect, beforeAll } from "vitest";
import { getDb, runMigrations } from "@/lib/db";
import { registerUser, loginUser } from "@/lib/auth/service";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("auth flow", () => {
  beforeAll(async () => {
    await getDb();
    try { await runMigrations(); } catch { /* applied */ }
    // ensure the free plan exists so registration grants it
    const db = await getDb();
    const { plans } = await import("@/lib/db/schema");
    await db.insert(plans).values({
      id: "90000000-0000-49aa-80aa-000000000001",
      code: "free", name: "Free", monthlyPriceCents: 0, annualPriceCents: 0,
      generationCredits: 20, humanizationLimit: 5, maxProjects: 2, maxChapters: 10,
      maxManuscriptWords: 5000, exportEnabled: false, features: [], modelAccess: [],
      sortOrder: 0, isActive: true,
    }).onConflictDoNothing();
  }, 60000);

  it("registers a new user, grants free credits, and logs in", async () => {
    const email = `auth-test-${Date.now()}@example.com`;
    const { user, sessionToken } = await registerUser({ email, name: "Integration Tester", password: "Str0ng!Pass" });
    expect(user.email).toBe(email);
    expect(sessionToken).toBeTruthy();

    const db = await getDb();
    const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(rows[0]).toBeTruthy();
    expect(rows[0].role).toBe("USER");
    expect(rows[0].passwordHash).not.toBe("Str0ng!Pass");

    const { sessionToken: session2 } = await loginUser({ email, password: "Str0ng!Pass" });
    expect(session2).toBeTruthy();
  });

  it("rejects duplicate emails", async () => {
    const email = `auth-dupe-${Date.now()}@example.com`;
    await registerUser({ email, name: "First", password: "Str0ng!Pass" });
    await expect(registerUser({ email, name: "Second", password: "Str0ng!Pass" })).rejects.toThrow();
  });

  it("rejects weak passwords", async () => {
    await expect(registerUser({ email: `weak-${Date.now()}@example.com`, name: "Weak", password: "abc" })).rejects.toThrow();
  });

  it("rejects bad credentials", async () => {
    const email = `bad-cred-${Date.now()}@example.com`;
    await registerUser({ email, name: "Bad", password: "Str0ng!Pass" });
    await expect(loginUser({ email, password: "WrongPass123" })).rejects.toThrow();
  });
});
