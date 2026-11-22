import { withAuth, apiOk, HttpError, requireOwnership, parseBody } from "@/lib/api/handler";
import { outlineManualSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { projects, storyOutlines } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const rows = await db.select().from(storyOutlines).where(eq(storyOutlines.projectId, project.id)).limit(1);
  return apiOk({ outline: rows[0] ?? null }, ctx.requestId);
});

/** Manual outline edit (user-driven). */
export const PATCH = withAuth(async (req, ctx) => {
  const body = await parseBody(req, outlineManualSchema);
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const rows = await db.select().from(storyOutlines).where(eq(storyOutlines.projectId, project.id)).limit(1);
  const outline = rows[0];
  if (!outline) throw new HttpError(404, "not_found", "Outline not found");

  const updates: Record<string, unknown> = { updatedAt: new Date(), version: outline.version + 1 };
  for (const f of ["title", "logline", "synopsis", "themes", "chaptersMeta", "endingGoal", "status"] as const) {
    if ((body as any)[f] !== undefined) updates[f] = (body as any)[f];
  }
  const [updated] = await db.update(storyOutlines).set(updates).where(eq(storyOutlines.id, outline.id)).returning();
  return apiOk({ outline: updated }, ctx.requestId);
});
