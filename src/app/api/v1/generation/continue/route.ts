import { z } from "zod";
import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { projects, stories, chapters } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { enqueueJob } from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ projectId: z.string().uuid(), chapterId: z.string().uuid() });

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, schema);
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, body.projectId), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const chapterRows = await db.select().from(chapters).where(and(eq(chapters.id, body.chapterId), eq(chapters.projectId, project.id), isNull(chapters.deletedAt))).limit(1);
  const chapter = chapterRows[0];
  if (!chapter) throw new HttpError(404, "not_found", "Chapter not found");
  const storyRows = await db.select().from(stories).where(eq(stories.projectId, project.id)).limit(1);
  const { id: realJobId } = await enqueueJob({
    userId: ctx.user!.id,
    jobType: "CONTINUE_WRITING",
    projectId: project.id,
    storyId: storyRows[0]?.id ?? null,
    chapterId: chapter.id,
    payload: { projectId: project.id, chapterId: chapter.id, chapterIndex: chapter.index },
    dedupeKey: `continue:${chapter.id}:${chapter.version}`,
    idempotencyKey: `continue:${chapter.id}:${chapter.version}`,
  });
  return apiOk({ jobId: realJobId, status: "QUEUED" }, ctx.requestId);
});
