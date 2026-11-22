import { withAuth, apiOk, requireAdmin } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { aiModelUsage, aiModels } from "@/lib/db/schema";
import { sql, desc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select({
    modelId: aiModelUsage.modelId,
    task: aiModelUsage.task,
    tokensIn: sql<number>`sum(${aiModelUsage.tokensIn})::int`,
    tokensOut: sql<number>`sum(${aiModelUsage.tokensOut})::int`,
    cost: sql<number>`sum(${aiModelUsage.costEstimated})`,
    calls: sql<number>`count(*)::int`,
    lastUsed: sql<string>`max(${aiModelUsage.createdAt})::text`,
  }).from(aiModelUsage).groupBy(aiModelUsage.modelId, aiModelUsage.task).orderBy(desc(sql`sum(${aiModelUsage.tokensIn})`)).limit(50);
  return apiOk({ usage: rows }, ctx.requestId);
});
