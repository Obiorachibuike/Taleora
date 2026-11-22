import { withAuth, apiOk, requireOwnership, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { humanizationJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  const db = await getDb();
  const rows = await db.select().from(humanizationJobs).where(eq(humanizationJobs.id, ctx.params.id)).limit(1);
  const job = rows[0];
  if (!job) throw new HttpError(404, "not_found", "Humanization job not found");
  requireOwnership(ctx.user!, job.userId);
  if (["completed", "failed", "cancelled"].includes(job.status)) return apiOk({ already: true, status: job.status }, ctx.requestId);
  await db.update(humanizationJobs).set({ cancelRequestedAt: new Date(), currentStage: "cancelling" }).where(eq(humanizationJobs.id, job.id));
  return apiOk({ cancelRequested: true }, ctx.requestId);
});
