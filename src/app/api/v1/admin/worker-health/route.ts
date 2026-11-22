import { withAuth, apiOk, requireAdmin } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { generationJobs } from "@/lib/db/schema";
import { count, desc, eq, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const queue = await db.select({ status: generationJobs.status, c: count() }).from(generationJobs).groupBy(generationJobs.status);
  const recent = await db.select().from(generationJobs).orderBy(desc(generationJobs.createdAt)).limit(10);
  const failed = await db.select().from(generationJobs).where(eq(generationJobs.status, "FAILED")).orderBy(desc(generationJobs.createdAt)).limit(10);
  return apiOk({ queue, recent, failed }, ctx.requestId);
});
