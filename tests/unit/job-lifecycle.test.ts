import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { getDb, runMigrations } from "@/lib/db";
import { enqueueJob, claimNextJob, completeJob, cancelJob, getJob } from "@/lib/jobs/service";
import { users, generationJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("job lifecycle", () => {
  const userId = "11111111-1111-4111-8111-111111111111";

  beforeAll(async () => {
    await getDb();
    try { await runMigrations(); } catch { /* already applied */ }
    const db = await getDb();
    await db.insert(users).values({ id: userId, email: "job-lifecycle-test@example.com", name: "Job Tester", passwordHash: "test-hash", role: "USER", status: "ACTIVE" }).onConflictDoNothing();
  }, 60000);

  beforeEach(async () => {
    const db = await getDb();
    await db.delete(generationJobs).where(eq(generationJobs.userId, userId));
  });

  it("enqueues idempotently via idempotency key", async () => {
    const a = await enqueueJob({ userId, jobType: "STORY_GENERATION", payload: { hello: "world" }, idempotencyKey: "test-key-1", dedupeKey: "test-dedupe-1" });
    const b = await enqueueJob({ userId, jobType: "STORY_GENERATION", payload: { hello: "world" }, idempotencyKey: "test-key-1", dedupeKey: "test-dedupe-1" });
    expect(a.id).toBeTruthy();
    expect(a.id).toBe(b.id);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
  });

  it("claims a QUEUED job, records events, and completes it", async () => {
    const { id } = await enqueueJob({ userId, jobType: "OUTLINE_GENERATION", payload: { projectId: "x" }, idempotencyKey: "claim-key-1" });
    const claimed = await claimNextJob();
    expect(claimed).toBeTruthy();
    expect(claimed!.id).toBe(id);
    expect(claimed!.status).toBe("PROCESSING");

    await completeJob(id, { ok: true });
    await new Promise((r) => setTimeout(r, 50));
    const fresh = await getJob(id, userId);
    expect(fresh?.status).toBe("COMPLETED");
  });

  it("cancels a queued job (user-scoped) and it must not be claimed", async () => {
    const { id } = await enqueueJob({ userId, jobType: "HUMANIZATION", payload: { text: "x" }, idempotencyKey: "cancel-key-1" });
    const wasCancelled = await cancelJob(id, userId);
    expect(wasCancelled).toBe(true);
    const claim = await claimNextJob();
    expect(claim?.id).not.toBe(id);
  });

  it("getJob enforces ownership", async () => {
    const { id } = await enqueueJob({ userId, jobType: "STORY_GENERATION", payload: {}, idempotencyKey: "ownership-key-1" });
    expect(await getJob(id, "wrong-user-id")).toBeNull();
    expect(await getJob(id, userId)).toBeTruthy();
  });
});
