import { withAuth, apiOk, HttpError, requireOwnership, parseBody } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { projects, storyOutlines, stories } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const rows = await db.select().from(storyOutlines).where(eq(storyOutlines.projectId, project.id)).limit(1);
  const outline = rows[0];
  if (!outline) throw new HttpError(404, "not_found", "Outline not found");

  await db.update(storyOutlines).set({ status: "approved", updatedAt: new Date(), version: outline.version + 1 }).where(eq(storyOutlines.id, outline.id));
  await db.update(projects).set({ status: "in_progress", updatedAt: new Date() }).where(eq(projects.id, project.id));
  const storyRows = await db.select().from(stories).where(eq(stories.projectId, project.id)).limit(1);
  if (storyRows[0]) await db.update(stories).set({ status: "writing", updatedAt: new Date() }).where(eq(stories.id, storyRows[0].id));
  return apiOk({ outline: { ...outline, status: "approved" } }, ctx.requestId);
});
