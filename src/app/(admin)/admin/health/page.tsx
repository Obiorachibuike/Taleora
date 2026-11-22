import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { aiProviders, aiModelHealth } from "@/lib/db/schema";
import { asc, desc } from "drizzle-orm";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const db = await getDb();
  const providers = await db.select().from(aiProviders).orderBy(asc(aiProviders.name));
  const healthRows = await db.select().from(aiModelHealth).orderBy(desc(aiModelHealth.checkedAt)).limit(20);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Provider health</h1>
      <p className="text-sm text-muted mt-1">Health is recorded live — never trusted blindly</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {(providers as any[]).map((p) => (
          <div key={p.id} className="rounded-xl border border-line bg-surface p-5">
            <h3 className="font-semibold text-lg">{p.name}</h3>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={p.healthStatus === "healthy" ? "success" : p.healthStatus === "unhealthy" ? "danger" : "warning"}>{p.healthStatus ?? "unknown"}</Badge>
              <span className="text-xs text-muted">{p.adapterType}</span>
            </div>
          </div>
        ))}
      </div>
      <h2 className="mt-8 font-display text-xl font-bold">Recent probe results</h2>
      <div className="mt-4 space-y-2">
        {(healthRows as any[]).map((h) => (
          <div key={h.id} className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-2.5 text-sm">
            <div>
              <span className="font-mono text-xs text-muted">{h.providerId?.slice(0, 8) ?? "—"}</span>
              <p className="text-muted">{h.errorMessage ? <span className="text-red-400">{h.errorMessage.slice(0, 200)}</span> : `${h.latencyMs}ms`}</p>
            </div>
            <Badge variant={h.healthy ? "success" : "danger"}>{h.healthy ? "healthy" : "unhealthy"}</Badge>
          </div>
        ))}
        {healthRows.length === 0 && <p className="text-sm text-muted">No probes recorded yet.</p>}
      </div>
    </div>
  );
}
