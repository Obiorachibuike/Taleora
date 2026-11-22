import { withAuth, apiOk, HttpError, requireOwnership } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { projects, chapters, chapterVersions } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const chapterRows = await db.select().from(chapters).where(and(eq(chapters.id, ctx.params.chapterId), eq(chapters.projectId, project.id), isNull(chapters.deletedAt))).limit(1);
  const chapter = chapterRows[0];
  if (!chapter) throw new HttpError(404, "not_found", "Chapter not found");
  const versions = await db.select().from(chapterVersions).where(eq(chapterVersions.chapterId, chapter.id)).orderBy(chapterVersions.version);
  return apiOk({ chapter, versions }, ctx.requestId);
});
