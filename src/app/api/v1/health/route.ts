import { NextResponse } from "next/server";
import { getDb, dbKind } from "@/lib/db";
import { sql } from "drizzle-orm";
import { generationJobs } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check — public, no auth, no secrets.
 * Returns: ok, db connectivity, job queue size, config version.
 * Used by uptime monitors and deploy health checks. Not destructive.
 */
export async function GET() {
  const started = Date.now();
  const checks: Record<string, { ok: boolean; detail?: string }> = {
    db: { ok: false },
    queue: { ok: false },
  };
  let dbStatus: string = "unknown";
  let configVersion: number | null = null;

  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    checks.db = { ok: true, detail: dbKind() ?? undefined };
    dbStatus = "ok";
  } catch (err: any) {
    checks.db = { ok: false, detail: String(err?.message ?? err).slice(0, 200) };
  }

  try {
    const db = await getDb();
    const rows = await db.select({ c: count() }).from(generationJobs).where(eq(generationJobs.status, "QUEUED"));
    checks.queue = { ok: true, detail: `${rows[0]?.c ?? 0} queued` };
  } catch (err: any) {
    checks.queue = { ok: false, detail: String(err?.message ?? err).slice(0, 200) };
  }

  try {
    const db = await getDb();
    const { adminSettings } = await import("@/lib/db/schema");
    const row = await db.select().from(adminSettings).where(eq(adminSettings.key, "ai_config_version")).limit(1);
    configVersion = (row[0]?.value as any)?.version ?? null;
  } catch { /* optional */ }

  const ok = checks.db.ok;
  return NextResponse.json({
    ok,
    status: ok ? "healthy" : "degraded",
    dbKind: dbKind(),
    configVersion,
    checks,
    latencyMs: Date.now() - started,
  }, { status: ok ? 200 : 503 });
}
