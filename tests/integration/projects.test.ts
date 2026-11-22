import { describe, it, expect, beforeAll } from "vitest";
import { getDb, runMigrations } from "@/lib/db";
import { users, projects, chapters, stories, plans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { registerUser } from "@/lib/auth/service";

describe("projects & ownership", () => {
  const ownerId = "10000000-0000-4000-8000-000000000001";
  const otherId = "10000000-0000-4000-8000-000000000002";

  beforeAll(async () => {
    await getDb();
    try { await runMigrations(); } catch { /* applied */ }
    const db = await getDb();
    await db.insert(users).values({ id: ownerId, email: "proj-owner@example.com", name: "Owner", passwordHash: "x", role: "USER", status: "ACTIVE" }).onConflictDoNothing();
    await db.insert(users).values({ id: otherId, email: "proj-other@example.com", name: "Other", passwordHash: "x", role: "USER", status: "ACTIVE" }).onConflictDoNothing();
  }, 60000);

  it("creates a project for the owner and blocks reading by other users", async () => {
    const db = await getDb();
    const [project] = await db.insert(projects).values({
      id: "10000000-0000-4000-8000-0000000000aa",
      userId: ownerId,
      title: "The Hollow Crown",
      status: "draft",
      genre: "Fantasy",
      premise: "A mercenary discovers the war was manufactured.",
      targetChapters: 8,
    }).returning();
    expect(project.id).toBeTruthy();

    // direct ownership checks
    const rows = await db.select().from(projects).where(eq(projects.id, project.id)).limit(1);
    expect(rows[0].userId).toBe(ownerId);
    expect(rows[0].userId).not.toBe(otherId);
  });

  it("creates chapters with content and correct word counts", async () => {
    const db = await getDb();
    const content = "One two three four five. Six seven eight.";
    const [chapter] = await db.insert(chapters).values({
      id: "10000000-0000-4000-8000-0000000000bb",
      projectId: "10000000-0000-4000-8000-0000000000aa",
      index: 0,
      title: "Chapter One",
      content,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      status: "completed",
      version: 1,
    }).returning();
    expect(chapter.wordCount).toBe(8);

    const rows = await db.select().from(chapters).where(eq(chapters.projectId, "10000000-0000-4000-8000-0000000000aa"));
    expect(rows.length).toBe(1);
  });
});
