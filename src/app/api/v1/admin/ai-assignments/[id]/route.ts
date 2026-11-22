import { withAuth, apiOk, requireAdmin, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { aiModelAssignments, adminAuditLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { bumpConfigVersion } from "@/lib/ai/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(aiModelAssignments).where(eq(aiModelAssignments.id, ctx.params.id)).limit(1);
  const row = rows[0];
  if (!row) throw new HttpError(404, "not_found", "Assignment not found");
  await db.update(aiModelAssignments).set({ isEnabled: false, updatedAt: new Date() }).where(eq(aiModelAssignments.id, row.id));
  await db.insert(adminAuditLogs).values({ id: crypto.randomUUID(), actorId: ctx.user!.id, action: "assignment.disable", targetType: "assignment", targetId: row.id, details: { task: row.task } });
  await bumpConfigVersion(ctx.user!.id, `assignment.disable:${row.task}`);
  return apiOk({ disabled: true }, ctx.requestId);
});
