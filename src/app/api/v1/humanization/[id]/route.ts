import { withAuth, apiOk, HttpError, requireOwnership } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { humanizationJobs, humanizationVersions, humanizationChunks, humanizationChanges } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const rows = await db.select().from(humanizationJobs).where(eq(humanizationJobs.id, ctx.params.id)).limit(1);
  const job = rows[0];
  if (!job) throw new HttpError(404, "not_found", "Humanization job not found");
  requireOwnership(ctx.user!, job.userId);
  const versions = await db.select().from(humanizationVersions).where(eq(humanizationVersions.jobId, job.id)).orderBy(humanizationVersions.version);
  const chunks = await db.select().from(humanizationChunks).where(eq(humanizationChunks.jobId, job.id)).orderBy(humanizationChunks.index);
  const changes = await db.select().from(humanizationChanges).where(eq(humanizationChanges.jobId, job.id)).orderBy(humanizationChanges.chunkIndex);
  return apiOk({ job, versions, chunks, changes }, ctx.requestId);
});

export const DELETE = withAuth(async (req, ctx) => {
  const db = await getDb();
  const rows = await db.select().from(humanizationJobs).where(eq(humanizationJobs.id, ctx.params.id)).limit(1);
  const job = rows[0];
  if (!job) throw new HttpError(404, "not_found", "Humanization job not found");
  requireOwnership(ctx.user!, job.userId);
  await db.delete(humanizationJobs).where(eq(humanizationJobs.id, job.id));
  return apiOk({ deleted: true }, ctx.requestId);
});
