import { withAuth, apiOk, HttpError, requireOwnership } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { projects, storyFacts, storyEvents, storyTimelines, storySummaries, storyMemories } from "@/lib/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { retrieveContext } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const facts = await db.select().from(storyFacts).where(and(eq(storyFacts.projectId, project.id), isNull(storyFacts.deletedAt))).orderBy(desc(storyFacts.createdAt)).limit(50);
  const events = await db.select().from(storyEvents).where(eq(storyEvents.projectId, project.id)).orderBy(storyEvents.sequence).limit(50);
  const timelines = await db.select().from(storyTimelines).where(eq(storyTimelines.projectId, project.id)).limit(20);
  const summaries = await db.select().from(storySummaries).where(eq(storySummaries.projectId, project.id)).orderBy(desc(storySummaries.chapterIndex)).limit(6);
  const threads = await db.select().from(storyMemories).where(and(eq(storyMemories.projectId, project.id), eq(storyMemories.kind, "thread"), isNull(storyMemories.deletedAt))).limit(20);
  const context = await retrieveContext(project.id).catch(() => "");
  return apiOk({ facts, events, timelines, summaries, threads, context }, ctx.requestId);
});
