import { z } from "zod";
import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { projects, chapters } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { heuristicExtract, persistExtraction, saveChapterSummary } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ chapterId: z.string().uuid().optional() });

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, schema);
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);

  const chapterId = body.chapterId;
  const chRows = await db.select().from(chapters).where(and(eq(chapters.projectId, project.id), isNull(chapters.deletedAt))).orderBy(desc(chapters.index)).limit(2);
  const target = chapterId
    ? (await db.select().from(chapters).where(and(eq(chapters.id, chapterId), eq(chapters.projectId, project.id))).limit(1))[0]
    : chRows.find((c: any) => c.content) ?? chRows[0];
  if (!target) throw new HttpError(404, "not_found", "No chapter with content to extract");

  const extraction = heuristicExtract(target.content, target.index);
  const counts = await persistExtraction(project.id, target.index, extraction, ctx.user!.id);
  await saveChapterSummary(project.id, target.index, (extraction.events[0]?.summary ?? target.content.slice(0, 300)), [], []);
  return apiOk({ ...counts, extractedFromChapter: target.id, chapterIndex: target.index }, ctx.requestId);
});
