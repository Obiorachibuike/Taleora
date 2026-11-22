import { withAuth, apiOk, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  const db = await getDb();
  const rows = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, ctx.user!.id), inArray(subscriptions.status, ["trialing", "active", "past_due"]))).limit(1);
  const sub = rows[0];
  if (!sub) throw new HttpError(404, "not_found", "No active subscription");
  const [updated] = await db.update(subscriptions).set({ cancelAtPeriodEnd: true, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id)).returning();
  return apiOk({ subscription: updated }, ctx.requestId);
});
