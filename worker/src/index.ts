/**
 * Taleora worker — drains the generation_jobs table and processes jobs.
 *
 * Architecture: the worker polls `generation_jobs` (claiming atomically),
 * processes + persists results, records events, and supports retry with backoff.
 * Graceful shutdown on SIGTERM/SIGINT. Stale jobs are recovered on start.
 *
 * Usage: npm run worker
 */
import "dotenv/config";
import { getDb, closeDb, runMigrations } from "@/lib/db";
import { claimNextJob, completeJob, failJob, incrementRetry, recordJobEvent, updateJobProgress, recoverStaleJobs } from "@/lib/jobs/service";
import {
  processOutlineGeneration,
  processChapterGeneration,
  processContinueWriting,
  processHumanization,
  processCharacterGeneration,
  processMemoryExtraction,
  processContinuityCheck,
  processStoryAnalysis,
  processStoryGeneration,
  processExport,
  processCoverGeneration,
} from "./processors";

const POLL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS ?? "1500", 10);
const LEASE_MS = parseInt(process.env.WORKER_LEASE_MS ?? "120000", 10);
const MAX_RETRIES = parseInt(process.env.WORKER_MAX_RETRIES ?? "3", 10);

const dispatch: Record<string, (job: any) => Promise<Record<string, unknown>>> = {
  OUTLINE_GENERATION: processOutlineGeneration,
  CHAPTER_GENERATION: processChapterGeneration,
  CONTINUE_WRITING: processContinueWriting,
  HUMANIZATION: processHumanization,
  CHARACTER_GENERATION: processCharacterGeneration,
  MEMORY_EXTRACTION: processMemoryExtraction,
  CONTINUITY_CHECK: processContinuityCheck,
  STORY_ANALYSIS: processStoryAnalysis,
  STORY_GENERATION: processStoryGeneration,
  DOCUMENT_EXPORT: processExport,
  COVER_GENERATION: processCoverGeneration,
};

let shuttingDown = false;
process.on("SIGTERM", () => { shuttingDown = true; console.log("[worker] SIGTERM received"); });
process.on("SIGINT", () => { shuttingDown = true; console.log("[worker] SIGINT received"); });

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function processJob(job: any) {
  const handler = dispatch[job.jobType];
  if (!handler) {
    await failJob(job.id, `No processor registered for job type ${job.jobType}`);
    return;
  }
  try {
    await updateJobProgress(job.id, 5, "started");
    const result = await handler(job);
    await recordJobEvent(job.id, "processing:complete", { result });
    await completeJob(job.id, result ?? {});
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] job ${job.id} (${job.jobType}) failed: ${errMsg}`);
    const retried = await incrementRetry(job.id);
    if (retried > MAX_RETRIES || job.retryCount >= MAX_RETRIES) {
      await failJob(job.id, `Job failed: ${errMsg.slice(0, 500)}`);
    } else {
      // requeue with backoff: leave QUEUED, the claim-next loop will re-pick it later
      // (the next loop iteration may immediately retry — add a soft delay)
      await sleep(Math.min(1000 * 2 ** retried, 8000));
    }
  }
}

async function main() {
  console.log("[worker] starting…");
  await getDb();
  try {
    await runMigrations();
    console.log("[worker] migrations applied");
  } catch (err) {
    console.error("[worker] migrations failed:", err instanceof Error ? err.message : err);
  }
  const recovered = await recoverStaleJobs(LEASE_MS);
  if (recovered > 0) console.log(`[worker] recovered ${recovered} stale job(s)`);

  while (!shuttingDown) {
    let claimed = null;
    try {
      claimed = await claimNextJob();
    } catch (err) {
      console.error("[worker] claim failed:", err instanceof Error ? err.message : err);
      await sleep(POLL_MS);
      continue;
    }
    if (!claimed) {
      await sleep(POLL_MS);
      continue;
    }
    if (shuttingDown) break;
    await processJob(claimed).catch(async (err) => {
      console.error("[worker] unhandled processor error:", err instanceof Error ? err.message : err);
      try { await failJob(claimed.id, `Unhandled processor error: ${err instanceof Error ? err.message : String(err)}`); } catch { /* ignore */ }
    });
  }
  console.log("[worker] shutting down");
  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
