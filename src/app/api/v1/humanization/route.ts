import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { humanizeSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { humanizationJobs, projects } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { assertCanHumanize, assertCreditsFor } from "@/lib/entitlements";
import { countWords } from "@/lib/humanization/pipeline";
import { enqueueJob } from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const rows = await db.select().from(humanizationJobs).where(eq(humanizationJobs.userId, ctx.user!.id)).orderBy(desc(humanizationJobs.createdAt)).limit(50);
  return apiOk({ jobs: rows }, ctx.requestId);
});

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, humanizeSchema);

  // ownership check for optional project context
  if (body.projectId) {
    const db = await getDb();
    const projectRows = await db.select().from(projects).where(eq(projects.id, body.projectId)).limit(1);
    const project = projectRows[0];
    if (!project || project.deletedAt) throw new HttpError(404, "not_found", "Project not found");
    requireOwnership(ctx.user!, project.userId);
  }

  await assertCanHumanize(ctx.user!);
  await assertCreditsFor(ctx.user!, 1, "humanize");
  const db = await getDb();
  const before = countWords(body.text);
  const [job] = await db.insert(humanizationJobs).values({
    id: crypto.randomUUID(),
    userId: ctx.user!.id,
    projectId: body.projectId ?? null,
    originalText: body.text,
    mode: body.mode,
    intensity: body.intensity,
    status: "pending",
    progress: 0,
    currentStage: "queued",
    wordCountBefore: before,
    chunkCount: 0,
    completedChunks: 0,
  }).returning();

  // enqueue the real job (idempotent)
  const { id: realJobId } = await enqueueJob({
    userId: ctx.user!.id,
    jobType: "HUMANIZATION",
    projectId: body.projectId ?? null,
    payload: { humanizationJobId: job.id, mode: body.mode, intensity: body.intensity },
    dedupeKey: `humanize:${job.id}`,
    idempotencyKey: `humanize:${job.id}`,
  });

  return apiOk({ id: job.id, jobId: realJobId, status: job.status }, ctx.requestId);
});
