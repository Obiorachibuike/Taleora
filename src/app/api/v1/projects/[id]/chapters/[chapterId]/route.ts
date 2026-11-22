import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { chapterUpdateSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { projects, chapters, chapterVersions, stories } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const rows = await db.select().from(chapters).where(and(eq(chapters.id, ctx.params.chapterId), eq(chapters.projectId, project.id), isNull(chapters.deletedAt))).limit(1);
  const chapter = rows[0];
  if (!chapter) throw new HttpError(404, "not_found", "Chapter not found");
  return apiOk({ chapter }, ctx.requestId);
});

export const PATCH = withAuth(async (req, ctx) => {
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const body = await parseBody(req, chapterUpdateSchema);
  const rows = await db.select().from(chapters).where(and(eq(chapters.id, ctx.params.chapterId), eq(chapters.projectId, project.id), isNull(chapters.deletedAt))).limit(1);
  const chapter = rows[0];
  if (!chapter) throw new HttpError(404, "not_found", "Chapter not found");
  if (body.version !== chapter.version) throw new HttpError(409, "stale_version", "Chapter was modified. Please reload.");

  const updates: Record<string, unknown> = { version: chapter.version + 1, updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.content !== undefined) {
    updates.content = body.content;
    updates.wordCount = body.content.trim().split(/\s+/).filter(Boolean).length;
  }
  await db.insert(chapterVersions).values({
    id: crypto.randomUUID(),
    chapterId: chapter.id,
    version: chapter.version,
    title: chapter.title,
    content: chapter.content,
    source: "manual",
  });
  const [updated] = await db.update(chapters).set(updates).where(eq(chapters.id, chapter.id)).returning();
  // update project word count / status
  await recomputeProject(db, project.id);
  return apiOk({ chapter: updated }, ctx.requestId);
});

export const DELETE = withAuth(async (req, ctx) => {
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const rows = await db.select().from(chapters).where(and(eq(chapters.id, ctx.params.chapterId), eq(chapters.projectId, project.id), isNull(chapters.deletedAt))).limit(1);
  const chapter = rows[0];
  if (!chapter) throw new HttpError(404, "not_found", "Chapter not found");
  await db.update(chapters).set({ deletedAt: new Date() }).where(eq(chapters.id, chapter.id));
  await recomputeProject(db, project.id);
  return apiOk({ deleted: true }, ctx.requestId);
});

async function recomputeProject(db: any, projectId: string) {
  const rows = await db.select().from(chapters).where(and(eq(chapters.projectId, projectId), isNull(chapters.deletedAt)));
  const totalWords = rows.reduce((s: number, c: any) => s + (c.wordCount ?? 0), 0);
  const storyRows = await db.select().from(stories).where(eq(stories.projectId, projectId)).limit(1);
  if (storyRows[0]) await db.update(stories).set({ wordCount: totalWords, updatedAt: new Date() }).where(eq(stories.id, storyRows[0].id));
}
