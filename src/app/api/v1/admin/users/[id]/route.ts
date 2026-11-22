import { withAuth, apiOk, parseBody, requireAdmin, requireSuperAdmin, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { users, projects, generationJobs, auditLogs } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]).optional(),
  role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(),
  name: z.string().max(120).optional(),
});

export const GET = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.id, ctx.params.id)).limit(1);
  const u = rows[0];
  if (!u) throw new HttpError(404, "not_found", "User not found");
  const projRows = await db.select().from(projects).where(and(eq(projects.userId, u.id), isNull(projects.deletedAt))).limit(20);
  return apiOk({ user: u, projects: projRows }, ctx.requestId);
});

export const PATCH = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const body = await parseBody(req, patchSchema);
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.id, ctx.params.id)).limit(1);
  const u = rows[0];
  if (!u) throw new HttpError(404, "not_found", "User not found");
  // privilege changes: SUPER_ADMIN-only
  if (body.role !== undefined && body.role !== u.role) {
    requireSuperAdmin(ctx.user!);
    // prevent self-demotion/privilege escalation tricks: admin can't change their own role
    if (u.id === ctx.user!.id) throw new HttpError(403, "self_change_forbidden", "You cannot change your own role");
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), actorId: ctx.user!.id, action: "user.role_change", resourceType: "user", resourceId: u.id, details: { from: u.role, to: body.role } });
    await db.update(users).set({ role: body.role, updatedAt: new Date() }).where(eq(users.id, u.id));
  }
  if (body.status !== undefined && body.status !== u.status) {
    requireSuperAdmin(ctx.user!);
    if (u.id === ctx.user!.id && (body.status === "SUSPENDED" || body.status === "DELETED")) throw new HttpError(403, "self_change_forbidden", "You cannot suspend or delete your own account");
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), actorId: ctx.user!.id, action: "user.status_change", resourceType: "user", resourceId: u.id, details: { from: u.status, to: body.status } });
    await db.update(users).set({ status: body.status, deletedAt: body.status === "DELETED" ? new Date() : null, updatedAt: new Date() }).where(eq(users.id, u.id));
  }
  if (body.name !== undefined) await db.update(users).set({ name: body.name, updatedAt: new Date() }).where(eq(users.id, u.id));
  const updated = (await db.select().from(users).where(eq(users.id, u.id)).limit(1))[0];
  return apiOk({ user: updated }, ctx.requestId);
});
