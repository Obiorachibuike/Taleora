import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { humanizeAcceptRejectSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { humanizationJobs, humanizationChanges } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  const db = await getDb();
  const jobRows = await db.select().from(humanizationJobs).where(eq(humanizationJobs.id, ctx.params.id)).limit(1);
  const job = jobRows[0];
  if (!job) throw new HttpError(404, "not_found", "Humanization job not found");
  requireOwnership(ctx.user!, job.userId);
  const body = await parseBody(req, humanizeAcceptRejectSchema);
  const idx = body.index ?? Number(ctx.params.changeIndex);
  if (Number.isNaN(idx)) throw new HttpError(400, "validation_failed", "changeIndex required");
  const rows = await db.select().from(humanizationChanges).where(and(eq(humanizationChanges.jobId, job.id), eq(humanizationChanges.chunkIndex, idx))).limit(1);
  const change = rows[0];
  if (!change) throw new HttpError(404, "not_found", "Change not found");
  const [updated] = await db.update(humanizationChanges).set({ accepted: body.accepted }).where(eq(humanizationChanges.id, change.id)).returning();
  return apiOk({ change: updated }, ctx.requestId);
});
