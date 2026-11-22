import { getDb } from "@/lib/db";
import { generationJobs, generationJobEvents, type GenerationJob } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { GenerationJobType } from "@/shared/types";
import { getConfigVersion } from "@/lib/ai/router";
import { log } from "@/lib/logging";

export class JobConflict extends Error {
  constructor(public job: GenerationJob) { super("Duplicate job"); this.name = "JobConflict"; }
}

export interface EnqueueInput {
  userId: string;
  jobType: GenerationJobType;
  projectId?: string | null;
  storyId?: string | null;
  chapterId?: string | null;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
  idempotencyKey?: string;
  maxRetries?: number;
  provider?: string | null;
  model?: string | null;
  configVersion?: number;
}

/** Insert a QUEUED job with snapshot config version. Idempotent per idempotencyKey. */
export async function enqueueJob(input: EnqueueInput): Promise<{ id: string; created: boolean; job: GenerationJob }> {
  const db = await getDb();
  const configVersion = input.configVersion ?? await getConfigVersion();

  // Idempotency: return the existing job instead of creating a duplicate
  if (input.idempotencyKey) {
    const existing = await db.select().from(generationJobs).where(eq(generationJobs.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing[0]) return { id: existing[0].id, created: false, job: existing[0] };
  }

  // Dedupe: don't stack duplicates of the same work
  if (input.dedupeKey) {
    const rows = await db
      .select()
      .from(generationJobs)
      .where(
        and(
          eq(generationJobs.dedupeKey, input.dedupeKey),
          eq(generationJobs.status, "QUEUED")
        )
      )
      .limit(1);
    if (rows[0]) return { id: rows[0].id, created: false, job: rows[0] };
  }

  const [job] = await db.insert(generationJobs).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    projectId: input.projectId ?? null,
    storyId: input.storyId ?? null,
    chapterId: input.chapterId ?? null,
    jobType: input.jobType,
    status: "QUEUED",
    provider: input.provider ?? null,
    model: input.model ?? null,
    configVersion,
    payload: input.payload ?? {},
    dedupeKey: input.dedupeKey ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    maxRetries: input.maxRetries ?? 3,
  }).returning();

  await recordJobEvent(job.id, "enqueued", { jobType: input.jobType, jobId: job.id });
  return { id: job.id, created: true, job };
}

/** Append a monotonically-increasing event for a job. */
export async function recordJobEvent(jobId: string, eventType: string, data: Record<string, unknown> = {}): Promise<number> {
  const db = await getDb();
  const rows = await db.select({ maxSeq: sql<number>`coalesce(max(${generationJobEvents.seq}), 0)` }).from(generationJobEvents).where(eq(generationJobEvents.jobId, jobId));
  const seq = (rows[0]?.maxSeq ?? 0) + 1;
  try {
    await db.insert(generationJobEvents).values({ id: crypto.randomUUID(), jobId, seq, eventType, data });
  } catch (err: any) {
    // unique constraint on (jobId, seq) — concurrent writer; ignore
    if (typeof err?.message === "string" && err.message.includes("unique")) return seq;
    throw err;
  }
  return seq;
}

export async function getJob(jobId: string, userId?: string): Promise<GenerationJob | null> {
  const db = await getDb();
  const rows = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job) return null;
  if (userId && job.userId !== userId) return null;
  return job;
}

export async function listJobs(userId: string, limit = 50, offset = 0): Promise<{ jobs: GenerationJob[]; total: number }> {
  const db = await getDb();
  const rows = await db.select().from(generationJobs).where(eq(generationJobs.userId, userId)).orderBy(sql`${generationJobs.createdAt} desc`).limit(limit).offset(offset);
  const countRows = await db.select({ c: sql<number>`count(*)::int` }).from(generationJobs).where(eq(generationJobs.userId, userId));
  return { jobs: rows, total: countRows[0]?.c ?? 0 };
}

export async function cancelJob(jobId: string, userId: string): Promise<boolean> {
  const db = await getDb();
  const job = await getJob(jobId, userId);
  if (!job) return false;
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) return false;
  await db.update(generationJobs).set({ status: "CANCELLED", canceledAt: new Date() }).where(eq(generationJobs.id, jobId));
  await recordJobEvent(jobId, "cancelled", { status: "CANCELLED" });
  return true;
}

export async function updateJobProgress(jobId: string, progress: number, stage?: string) {
  const db = await getDb();
  await db.update(generationJobs).set({ progress, currentStage: stage ?? null }).where(eq(generationJobs.id, jobId));
  await recordJobEvent(jobId, "progress", { progress, stage });
}

export async function completeJob(jobId: string, result?: Record<string, unknown>) {
  const db = await getDb();
  await db.update(generationJobs).set({ status: "COMPLETED", completedAt: new Date(), result: result ?? {}, progress: 100 }).where(eq(generationJobs.id, jobId));
  await recordJobEvent(jobId, "completed", { status: "COMPLETED" });
}

export async function failJob(jobId: string, errorMessage: string) {
  const db = await getDb();
  await db.update(generationJobs).set({ status: "FAILED", errorMessage: errorMessage.slice(0, 1000), completedAt: new Date() }).where(eq(generationJobs.id, jobId));
  await recordJobEvent(jobId, "failed", { error: errorMessage.slice(0, 500) });
}

export async function incrementRetry(jobId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job) return 0;
  const next = job.retryCount + 1;
  await db.update(generationJobs).set({ retryCount: next, status: "QUEUED" }).where(eq(generationJobs.id, jobId));
  await recordJobEvent(jobId, "retry", { retryCount: next });
  return next;
}

export async function getJobEvents(jobId: string, sinceSeq = 0): Promise<Array<{ seq: number; eventType: string; data: Record<string, unknown>; createdAt: Date }>> {
  const db = await getDb();
  const rows = await db.select().from(generationJobEvents).where(and(eq(generationJobEvents.jobId, jobId), sql`${generationJobEvents.seq} > ${sinceSeq}`)).orderBy(generationJobEvents.seq);
  return rows.map((r: any) => ({ seq: r.seq, eventType: r.eventType, data: r.data as Record<string, unknown>, createdAt: r.createdAt }));
}

/** Atomically claim the next queued job (skips cancelled/stale). */
export async function claimNextJob(): Promise<GenerationJob | null> {
  const db = await getDb();
  // find oldest QUEUED job with least retry count
  const rows = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.status, "QUEUED"))
    .orderBy(sql`${generationJobs.createdAt} asc`)
    .limit(1);
  const job = rows[0];
  if (!job) return null;
  // claim it
  const result = await db.update(generationJobs).set({ status: "PROCESSING", startedAt: new Date() })
    .where(and(eq(generationJobs.id, job.id), eq(generationJobs.status, "QUEUED")))
    .returning();
  if (!result[0]) return null; // someone else claimed it
  return result[0] as GenerationJob;
}

/** Recover stuck jobs (PROCESSING older than lease) back to QUEUED. */
export async function recoverStaleJobs(leaseMs = 120_000): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - leaseMs);
  const rows = await db.update(generationJobs).set({ status: "QUEUED", currentStage: null })
    .where(and(eq(generationJobs.status, "PROCESSING"), sql`${generationJobs.startedAt} < ${cutoff}`))
    .returning();
  for (const row of rows) {
    await recordJobEvent(row.id, "recovered", { status: "QUEUED" });
  }
  return rows.length;
}
