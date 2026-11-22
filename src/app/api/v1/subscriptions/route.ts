import { withAuth, apiOk } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { plans, subscriptions, creditAccounts } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getUserEntitlements } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const subRows = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, ctx.user!.id), inArray(subscriptions.status, ["trialing", "active", "past_due"]))).limit(5);
  const sub = subRows[0];
  let plan = null;
  if (sub) plan = (await db.select().from(plans).where(eq(plans.id, sub.planId)).limit(1))[0] ?? null;
  const creditRows = await db.select().from(creditAccounts).where(eq(creditAccounts.userId, ctx.user!.id)).limit(1);
  const ent = await getUserEntitlements(ctx.user!);
  return apiOk({ subscription: sub ?? null, plan, credits: creditRows[0]?.balance ?? 0, entitlements: ent }, ctx.requestId);
});
