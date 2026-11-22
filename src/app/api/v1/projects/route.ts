import { NextResponse } from "next/server";
import { withAuth, apiOk, parseBody, requireOwnership } from "@/lib/api/handler";
import { projectCreateSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { projects, stories, chapters, type Project } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getUserEntitlements, assertCanCreateProject } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const rows = await db.select().from(projects).where(and(eq(projects.userId, ctx.user!.id), isNull(projects.deletedAt))).orderBy(desc(projects.updatedAt)).limit(100);
  const storyCounts = await db.select().from(stories).where(eq(stories.userId, ctx.user!.id));
  const storyByProject = new Map((storyCounts as any[]).map((s) => [s.projectId, s]));
  const data = rows.map((p: any) => ({ ...p, story: storyByProject.get(p.id) ?? null }));
  return apiOk({ projects: data }, ctx.requestId);
});

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, projectCreateSchema);
  const db = await getDb();
  const existing = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.userId, ctx.user!.id), isNull(projects.deletedAt)));
  await assertCanCreateProject(ctx.user!, existing.length);

  const title = body.title;
  const [project] = await db.insert(projects).values({
    id: crypto.randomUUID(),
    userId: ctx.user!.id,
    title,
    description: body.description ?? null,
    genre: body.genre ?? null,
    subgenres: body.subgenres ?? [],
    premise: body.premise ?? null,
    audience: body.targetAudience ?? null,
    tone: body.tone ?? null,
    pov: body.pov ?? null,
    language: body.language ?? "en",
    targetChapters: body.targetChapters ?? null,
    targetWordsPerChapter: body.targetWordsPerChapter ?? null,
    totalWordTarget: body.totalWordTarget ?? null,
    themes: body.themes ?? [],
    conflict: body.conflict ?? null,
    endingGoal: body.endingGoal ?? null,
    setting: body.setting ?? null,
    status: "draft",
    version: 1,
  }).returning();

  const [story] = await db.insert(stories).values({
    id: crypto.randomUUID(),
    projectId: project.id,
    userId: ctx.user!.id,
    title: storyTitleFrom(body),
    status: "draft",
  }).returning();

  return apiOk({ project, story }, ctx.requestId);
});

function storyTitleFrom(body: any) {
  return body.title;
}
