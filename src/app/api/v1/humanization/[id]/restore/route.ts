import { withAuth, apiOk, requireOwnership, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { humanizationJobs, humanizationVersions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const versionId = url.searchParams.get("versionId");
  const db = await getDb();
  const jobRows = await db.select().from(humanizationJobs).where(eq(humanizationJobs.id, ctx.params.id)).limit(1);
  const job = jobRows[0];
  if (!job) throw new HttpError(404, "not_found", "Humanization job not found");
  requireOwnership(ctx.user!, job.userId);

  let targetText = job.originalText;
  if (versionId) {
    const versionRows = await db.select().from(humanizationVersions).where(and(eq(humanizationVersions.id, versionId), eq(humanizationVersions.jobId, job.id))).limit(1);
    if (!versionRows[0]) throw new HttpError(404, "not_found", "Version not found");
    targetText = versionRows[0].text;
  }
  const maxVersion = await db.select().from(humanizationVersions).where(eq(humanizationVersions.jobId, job.id)).orderBy(humanizationVersions.version);
  const nextVersion = (maxVersion[maxVersion.length - 1]?.version ?? 0) + 1;
  const [version] = await db.insert(humanizationVersions).values({ id: crypto.randomUUID(), jobId: job.id, version: nextVersion, text: targetText, source: "restore" }).returning();
  await db.update(humanizationJobs).set({ resultText: targetText, wordCountAfter: targetText.trim().split(/\s+/).filter(Boolean).length, updatedAt: new Date() }).where(eq(humanizationJobs.id, job.id));
  return apiOk({ version, restored: true }, ctx.requestId);
});
