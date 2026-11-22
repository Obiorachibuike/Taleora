import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { humanizeReRunSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { humanizationJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { enqueueJob } from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, humanizeReRunSchema);
  const db = await getDb();
  const rows = await db.select().from(humanizationJobs).where(eq(humanizationJobs.id, ctx.params.id)).limit(1);
  const job = rows[0];
  if (!job) throw new HttpError(404, "not_found", "Humanization job not found");
  requireOwnership(ctx.user!, job.userId);
  const mode = body.mode ?? job.mode;
  const intensity = body.intensity ?? job.intensity;
  const { id: realJobId } = await enqueueJob({
    userId: job.userId,
    jobType: "HUMANIZATION",
    projectId: job.projectId,
    payload: { humanizationJobId: job.id, mode, intensity },
    dedupeKey: `humanize:${job.id}:rerun:${Date.now()}`,
    idempotencyKey: `humanize:${job.id}:rerun:${crypto.randomUUID()}`,
  });
  return apiOk({ jobId: realJobId, status: "rerun_queued" }, ctx.requestId);
});
