import { withAuth, apiOk, parseBody, requireAdmin, HttpError } from "@/lib/api/handler";
import { planUpdateSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const body = await parseBody(req, planUpdateSchema);
  const db = await getDb();
  const rows = await db.select().from(plans).where(eq(plans.id, ctx.params.id)).limit(1);
  const plan = rows[0];
  if (!plan) throw new HttpError(404, "not_found", "Plan not found");
  const [updated] = await db.update(plans).set({ ...body, updatedAt: new Date() }).where(eq(plans.id, plan.id)).returning();
  return apiOk({ plan: updated }, ctx.requestId);
});

export const DELETE = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(plans).where(eq(plans.id, ctx.params.id)).limit(1);
  if (!rows[0]) throw new HttpError(404, "not_found", "Plan not found");
  await db.update(plans).set({ isActive: false, updatedAt: new Date() }).where(eq(plans.id, rows[0].id));
  return apiOk({ deactivated: true }, ctx.requestId);
});
