import { withAuth, apiOk, requireOwnership, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { projects, stories } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const rows = await db.select().from(stories).where(eq(stories.projectId, project.id)).limit(1);
  return apiOk({ story: rows[0] ?? null }, ctx.requestId);
});
