import { withAuth, apiOk, requireOwnership, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { exportJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const rows = await db.select().from(exportJobs).where(eq(exportJobs.id, ctx.params.id)).limit(1);
  const job = rows[0];
  if (!job) throw new HttpError(404, "not_found", "Export job not found");
  requireOwnership(ctx.user!, job.userId);
  return apiOk({ job }, ctx.requestId);
});
