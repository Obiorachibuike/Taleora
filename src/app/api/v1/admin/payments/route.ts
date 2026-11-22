import { withAuth, apiOk, requireAdmin } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { payments, users } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(100);
  const totals = await db.select({
    total: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'success'),0)::int`,
    count: sql<number>`count(*)::int`,
  }).from(payments);
  return apiOk({ payments: rows, totals: totals[0] }, ctx.requestId);
});
