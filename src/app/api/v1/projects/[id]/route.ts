import { NextResponse } from "next/server";
import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { projectUpdateSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { projects, stories, chapters } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const id = ctx.params.id;
  const db = await getDb();
  const rows = await db.select().from(projects).where(and(eq(projects.id, id), isNull(projects.deletedAt))).limit(1);
  const project = rows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const storyRows = await db.select().from(stories).where(eq(stories.projectId, id)).limit(1);
  const chapterRows = await db.select().from(chapters).where(and(eq(chapters.projectId, id), isNull(chapters.deletedAt))).orderBy(chapters.index);
  return apiOk({ project, story: storyRows[0] ?? null, chapters: chapterRows }, ctx.requestId);
});

export const PATCH = withAuth(async (req, ctx) => {
  const id = ctx.params.id;
  const body = await parseBody(req, projectUpdateSchema);
  const db = await getDb();
  const rows = await db.select().from(projects).where(and(eq(projects.id, id), isNull(projects.deletedAt))).limit(1);
  const project = rows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);

  // optimistic concurrency
  if (body.version && body.version !== project.version) {
    throw new HttpError(409, "stale_version", "Project was modified. Please reload.");
  }

  const updates: Record<string, unknown> = { version: project.version + 1, updatedAt: new Date() };
  const fields = ["title", "description", "genre", "subgenres", "premise", "audience", "tone", "pov", "language", "targetChapters", "targetWordsPerChapter", "totalWordTarget", "themes", "conflict", "endingGoal", "setting", "status"] as const;
  for (const f of fields) {
    if ((body as any)[f] !== undefined) {
      updates[f as string] = (body as any)[f];
    }
  }
  const [updated] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
  // sync story title if title changed
  if (updates.title) {
    await db.update(stories).set({ title: (updates.title as string), updatedAt: new Date() }).where(eq(stories.projectId, id));
  }
  return apiOk({ project: updated }, ctx.requestId);
});

export const DELETE = withAuth(async (req, ctx) => {
  const id = ctx.params.id;
  const db = await getDb();
  const rows = await db.select().from(projects).where(and(eq(projects.id, id), isNull(projects.deletedAt))).limit(1);
  const project = rows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  await db.update(projects).set({ deletedAt: new Date(), status: "archived", version: project.version + 1 }).where(eq(projects.id, id));
  return apiOk({ deleted: true }, ctx.requestId);
});
