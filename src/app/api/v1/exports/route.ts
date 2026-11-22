import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { exportCreateSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { projects, exportJobs } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getUserEntitlements } from "@/lib/entitlements";
import { enqueueJob } from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const db = await getDb();
  const conditions = [eq(exportJobs.userId, ctx.user!.id)];
  if (projectId) conditions.push(eq(exportJobs.projectId, projectId));
  const rows = await db.select().from(exportJobs).where(and(...conditions)).orderBy(desc(exportJobs.createdAt)).limit(30);
  return apiOk({ jobs: rows }, ctx.requestId);
});

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, exportCreateSchema);
  const db = await getDb();
  // create the export job record first
  const url = new URL(req.url);
  const projectId = new URL(req.url).searchParams.get("projectId") ?? new URL(req.url).searchParams.get("project");
  const finalProjectId = projectId;
  if (!finalProjectId) throw new HttpError(400, "validation_failed", "projectId query parameter required");
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, finalProjectId), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const ent = await getUserEntitlements(ctx.user!);
  if (!ent.unlimitedExports && !ent.exportEnabled) throw new HttpError(402, "export_not_allowed", "Your plan does not include exports");

  const [exportJob] = await db.insert(exportJobs).values({
    id: crypto.randomUUID(),
    userId: ctx.user!.id,
    projectId: project.id,
    storyId: null,
    format: body.format,
    status: "pending",
    progress: 0,
  }).returning();

  const { id: realJobId } = await enqueueJob({
    userId: ctx.user!.id,
    jobType: "DOCUMENT_EXPORT",
    projectId: project.id,
    payload: { projectId: project.id, exportJobId: exportJob.id, format: body.format },
    dedupeKey: `export:${project.id}:${body.format}:${Date.now()}`,
    idempotencyKey: `export:${project.id}:${body.format}:${Date.now()}`,
  });
  return apiOk({ exportJobId: exportJob.id, jobId: realJobId, status: "pending" }, ctx.requestId);
});
