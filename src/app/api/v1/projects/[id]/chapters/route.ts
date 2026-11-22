import { NextResponse } from "next/server";
import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { chapterCreateSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { projects, chapters } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { assertCanCreateChapter } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const rows = await db.select().from(chapters).where(and(eq(chapters.projectId, project.id), isNull(chapters.deletedAt))).orderBy(chapters.index);
  return apiOk({ chapters: rows }, ctx.requestId);
});

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, chapterCreateSchema);
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const existing = await db.select().from(chapters).where(and(eq(chapters.projectId, project.id), isNull(chapters.deletedAt)));
  await assertCanCreateChapter(ctx.user!, existing.length);
  const nextIndex = body.index ?? (existing.length ? Math.max(...existing.map((c: any) => c.index)) + 1 : 0);
  const [chapter] = await db.insert(chapters).values({
    id: crypto.randomUUID(),
    projectId: project.id,
    storyId: null,
    index: nextIndex,
    title: body.title,
    content: body.content,
    wordCount: wordCount(body.content),
    status: "edited",
    version: 1,
  }).returning();
  return apiOk({ chapter }, ctx.requestId);
});

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
