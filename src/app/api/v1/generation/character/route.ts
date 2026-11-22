import { z } from "zod";
import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { enqueueJob } from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ projectId: z.string().uuid(), name: z.string().trim().max(120).optional(), hints: z.string().max(2000).optional() });

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, schema);
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, body.projectId), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const { id: realJobId } = await enqueueJob({
    userId: ctx.user!.id,
    jobType: "CHARACTER_GENERATION",
    projectId: project.id,
    payload: { projectId: project.id, name: body.name, hints: body.hints },
    dedupeKey: `character:${project.id}:${body.name ?? "auto"}`,
    idempotencyKey: `character:${project.id}:${body.name ?? "auto"}:${Date.now()}`,
  });
  return apiOk({ jobId: realJobId, status: "QUEUED" }, ctx.requestId);
});
