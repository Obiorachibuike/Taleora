import { withAuth, apiOk, requireAdmin } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { users, projects, chapters, generationJobs, humanizationJobs, payments, subscriptions, aiModels, aiProviders, aiModelUsage } from "@/lib/db/schema";
import { count, sql, eq, inArray } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const [totalUsers] = await db.select({ c: count() }).from(users);
  const [activeUsers] = await db.select({ c: count() }).from(users).where(eq(users.status, "ACTIVE"));
  const [totalProjects] = await db.select({ c: count() }).from(projects);
  const [totalChapters] = await db.select({ c: count() }).from(chapters);
  const [totalJobs] = await db.select({ c: count() }).from(generationJobs);
  const [failedJobs] = await db.select({ c: count() }).from(generationJobs).where(eq(generationJobs.status, "FAILED"));
  const [humanizationCount] = await db.select({ c: count() }).from(humanizationJobs);
  const [paymentsCount] = await db.select({ c: count() }).from(payments).where(eq(payments.status, "success"));
  const [activeSubscriptions] = await db.select({ c: count() }).from(subscriptions).where(inArray(subscriptions.status, ["trialing", "active"]));
  const [providerHealthy] = await db.select({ c: count() }).from(aiProviders).where(eq(aiProviders.healthStatus, "healthy"));
  const usageRows = await db.select({ tokensIn: sql<number>`coalesce(sum(${aiModelUsage.tokensIn}),0)::int`, tokensOut: sql<number>`coalesce(sum(${aiModelUsage.tokensOut}),0)::int`, cost: sql<number>`coalesce(sum(${aiModelUsage.costEstimated}),0)` }).from(aiModelUsage);

  return apiOk({
    stats: {
      totalUsers: Number(totalUsers?.c ?? 0),
      activeUsers: Number(activeUsers?.c ?? 0),
      totalProjects: Number(totalProjects?.c ?? 0),
      totalChapters: Number(totalChapters?.c ?? 0),
      totalJobs: Number(totalJobs?.c ?? 0),
      failedJobs: Number(failedJobs?.c ?? 0),
      humanizationJobs: Number(humanizationCount?.c ?? 0),
      successfulPayments: Number(paymentsCount?.c ?? 0),
      activeSubscriptions: Number(activeSubscriptions?.c ?? 0),
      healthyProviders: Number(providerHealthy?.c ?? 0),
      totalModels: 0, // filled below
      totalProviders: (await db.select({ c: count() }).from(aiProviders))[0]?.c ?? 0,
      aiTokensIn: Number(usageRows[0]?.tokensIn ?? 0),
      aiTokensOut: Number(usageRows[0]?.tokensOut ?? 0),
      estimatedAiCost: Number(usageRows[0]?.cost ?? 0),
    },
  }, ctx.requestId);
});
