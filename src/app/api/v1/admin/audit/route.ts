import { withAuth, apiOk, requireAdmin } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { adminAuditLogs } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(100);
  return apiOk({ logs: rows }, ctx.requestId);
});
