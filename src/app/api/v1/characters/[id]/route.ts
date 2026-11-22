import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { characterCreateSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { projects, characters } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const rows = await db.select().from(characters).where(and(eq(characters.id, ctx.params.id), isNull(characters.deletedAt))).limit(1);
  const c = rows[0];
  if (!c) throw new HttpError(404, "not_found", "Character not found");
  requireOwnership(ctx.user!, c.userId);
  return apiOk({ character: c }, ctx.requestId);
});

export const PATCH = withAuth(async (req, ctx) => {
  const db = await getDb();
  const rows = await db.select().from(characters).where(and(eq(characters.id, ctx.params.id), isNull(characters.deletedAt))).limit(1);
  const c = rows[0];
  if (!c) throw new HttpError(404, "not_found", "Character not found");
  requireOwnership(ctx.user!, c.userId);
  const body = await parseBody(req, characterCreateSchema);
  if (body.version && body.version !== c.version) throw new HttpError(409, "stale_version", "Character was modified");
  const [updated] = await db.update(characters).set({
    name: body.name, age: body.age ?? c.age, type: body.type ?? c.type, role: body.role ?? c.role,
    appearance: body.appearance ?? c.appearance, personality: body.personality ?? c.personality,
    background: body.background ?? c.background, motivations: body.motivations ?? c.motivations,
    strengths: body.strengths ?? c.strengths, weaknesses: body.weaknesses ?? c.weaknesses,
    fears: body.fears ?? c.fears, goals: body.goals ?? c.goals,
    speechPatterns: body.speechPatterns ?? c.speechPatterns,
    developmentNotes: body.developmentNotes ?? c.developmentNotes,
    importantEvents: body.importantEvents ?? c.importantEvents,
    relationships: body.relationships ?? c.relationships,
    version: c.version + 1,
    updatedAt: new Date(),
  }).where(eq(characters.id, c.id)).returning();
  return apiOk({ character: updated }, ctx.requestId);
});

export const DELETE = withAuth(async (req, ctx) => {
  const db = await getDb();
  const rows = await db.select().from(characters).where(and(eq(characters.id, ctx.params.id), isNull(characters.deletedAt))).limit(1);
  const c = rows[0];
  if (!c) throw new HttpError(404, "not_found", "Character not found");
  requireOwnership(ctx.user!, c.userId);
  await db.update(characters).set({ deletedAt: new Date() }).where(eq(characters.id, c.id));
  return apiOk({ deleted: true }, ctx.requestId);
});
