import { z } from "zod";
import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { projects, stories, chapters } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { enqueueJob } from "@/lib/jobs/service";
import { getUserEntitlements } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ projectId: z.string().uuid(), chapterIndex: z.number().int().min(0) });

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, schema);
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, body.projectId), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const ent = await getUserEntitlements(ctx.user!);
  if (!ent.unlimitedGenerations && ent.credits < 1) throw new HttpError(402, "insufficient_credits", "Insufficient credits to generate a chapter");

  const storyRows = await db.select().from(stories).where(eq(stories.projectId, project.id)).limit(1);
  const { id: realJobId, created } = await enqueueJob({
    userId: ctx.user!.id,
    jobType: "CHAPTER_GENERATION",
    projectId: project.id,
    storyId: storyRows[0]?.id ?? null,
    payload: { projectId: project.id, chapterIndex: body.chapterIndex },
    dedupeKey: `chapter:${project.id}:${body.chapterIndex}`,
    idempotencyKey: `chapter:${project.id}:${body.chapterIndex}`,
  });
  return apiOk({ jobId: realJobId, status: "QUEUED", created }, ctx.requestId);
});
