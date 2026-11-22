import { withAuth, apiOk, requireAdmin } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { users, projects, generationJobs } from "@/lib/db/schema";
import { eq, isNull, sql, and } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase();
  const status = url.searchParams.get("status");
  const db = await getDb();
  let query = db.select().from(users).where(isNull(users.deletedAt)).$dynamic();
  const conditions = [isNull(users.deletedAt)];
  if (status) conditions.push(eq(users.status, status));
  const rows = await db.select().from(users).where(and(...conditions)).orderBy(users.createdAt).limit(200);
  const filtered = q
    ? (rows as any[]).filter((u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
    : rows;
  const data = await Promise.all((filtered as any[]).map(async (u) => {
    const projCount = (await db.select({ c: sql<number>`count(*)::int` }).from(projects).where(eq(projects.userId, u.id)))[0]?.c ?? 0;
    const jobCount = (await db.select({ c: sql<number>`count(*)::int` }).from(generationJobs).where(eq(generationJobs.userId, u.id)))[0]?.c ?? 0;
    return { ...u, projectCount: projCount, jobCount };
  }));
  return apiOk({ users: data }, ctx.requestId);
});
