import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { aiProviders } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { Card, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAIProvidersPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const db = await getDb();
  const rows = await db.select().from(aiProviders).orderBy(asc(aiProviders.name));

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">AI Providers</h1>
      <p className="text-sm text-muted mt-1">Configured providers. Keys are encrypted at rest and never returned to the browser.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {(rows as any[]).map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">{p.name}</h3>
              <Badge variant={p.isEnabled ? "success" : "default"}>{p.isEnabled ? "enabled" : "disabled"}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted"><span className="font-medium">adapter:</span> {p.adapterType}</p>
            <p className="text-xs text-muted"><span className="font-medium">base URL:</span> {p.baseUrl ?? "—"}</p>
            <p className="text-xs text-muted"><span className="font-medium">key:</span> {p.apiKeyEncrypted ? "[stored — encrypted]" : "not set"}</p>
            <div className="mt-3 flex items-center gap-2">
              <Badge variant={p.healthStatus === "healthy" ? "success" : p.healthStatus === "unhealthy" ? "danger" : "warning"}>{p.healthStatus ?? "unknown"}</Badge>
              <span className="text-xs text-muted">{p.maxRetries} retries · {p.timeoutMs}ms timeout</span>
            </div>
          </Card>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted">No providers configured. Use the API to add one.</p>}
      </div>
    </div>
  );
}
