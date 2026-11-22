import { z } from "zod";
import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { projects, stories, chapters } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { enqueueJob } from "@/lib/jobs/service";
import { getUserEntitlements } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ projectId: z.string().uuid() });

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, schema);
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, body.projectId), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const ent = await getUserEntitlements(ctx.user!);
  if (!ent.unlimitedGenerations && ent.credits < 1) throw new HttpError(402, "insufficient_credits", "Insufficient credits to generate an outline");

  const storyRows = await db.select().from(stories).where(eq(stories.projectId, project.id)).limit(1);
  const { id: realJobId } = await enqueueJob({
    userId: ctx.user!.id,
    jobType: "OUTLINE_GENERATION",
    projectId: project.id,
    storyId: storyRows[0]?.id ?? null,
    payload: { projectId: project.id, mode: "outline" },
    dedupeKey: `outline:${project.id}:${project.version}`,
    idempotencyKey: `outline:${project.id}:${project.version}`,
  });
  return apiOk({ jobId: realJobId, status: "QUEUED" }, ctx.requestId);
});
