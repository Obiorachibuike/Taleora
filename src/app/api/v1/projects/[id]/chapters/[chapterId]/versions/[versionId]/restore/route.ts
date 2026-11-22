import { withAuth, apiOk, HttpError, requireOwnership } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { projects, chapters, chapterVersions } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const chapterRows = await db.select().from(chapters).where(and(eq(chapters.id, ctx.params.chapterId), eq(chapters.projectId, project.id), isNull(chapters.deletedAt))).limit(1);
  const chapter = chapterRows[0];
  if (!chapter) throw new HttpError(404, "not_found", "Chapter not found");
  const versionRows = await db.select().from(chapterVersions).where(and(eq(chapterVersions.id, ctx.params.versionId), eq(chapterVersions.chapterId, chapter.id))).limit(1);
  const version = versionRows[0];
  if (!version) throw new HttpError(404, "not_found", "Version not found");

  // snapshot current state before restore
  await db.insert(chapterVersions).values({
    id: crypto.randomUUID(),
    chapterId: chapter.id,
    version: chapter.version,
    title: chapter.title,
    content: chapter.content,
    source: "manual",
    note: `Auto-snapshot before restore (v${version.version})`,
  });

  const [updated] = await db.update(chapters).set({
    title: version.title,
    content: version.content,
    wordCount: version.content.trim().split(/\s+/).filter(Boolean).length,
    version: chapter.version + 1,
    updatedAt: new Date(),
  }).where(eq(chapters.id, chapter.id)).returning();

  return apiOk({ chapter: updated }, ctx.requestId);
});
