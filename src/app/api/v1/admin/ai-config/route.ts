import { withAuth, apiOk, requireAdmin } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { getConfigVersion } from "@/lib/ai/router";
import { aiModelConfigVersions, adminSettings } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const version = await getConfigVersion();
  const history = await db.select().from(aiModelConfigVersions).orderBy(desc(aiModelConfigVersions.createdAt)).limit(20);
  const settings = await db.select().from(adminSettings);
  return apiOk({ version, history, adminSettings: settings }, ctx.requestId);
});
