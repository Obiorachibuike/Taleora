import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { characterCreateSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { projects, characters } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const rows = await db.select().from(characters).where(and(eq(characters.projectId, project.id), isNull(characters.deletedAt))).orderBy(characters.createdAt);
  return apiOk({ characters: rows }, ctx.requestId);
});

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, characterCreateSchema);
  const db = await getDb();
  const projectRows = await db.select().from(projects).where(and(eq(projects.id, ctx.params.id), isNull(projects.deletedAt))).limit(1);
  const project = projectRows[0];
  if (!project) throw new HttpError(404, "not_found", "Project not found");
  requireOwnership(ctx.user!, project.userId);
  const [c] = await db.insert(characters).values({
    id: crypto.randomUUID(),
    projectId: project.id,
    userId: ctx.user!.id,
    name: body.name,
    age: body.age ?? null,
    type: body.type ?? "character",
    role: body.role ?? null,
    appearance: body.appearance ?? null,
    personality: body.personality ?? null,
    background: body.background ?? null,
    motivations: body.motivations ?? null,
    strengths: body.strengths ?? [],
    weaknesses: body.weaknesses ?? [],
    fears: body.fears ?? null,
    goals: body.goals ?? null,
    speechPatterns: body.speechPatterns ?? null,
    developmentNotes: body.developmentNotes ?? null,
    importantEvents: body.importantEvents ?? [],
    relationships: body.relationships ?? {},
    version: 1,
  }).returning();
  return apiOk({ character: c }, ctx.requestId);
});
