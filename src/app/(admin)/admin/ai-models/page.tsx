import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { aiModels, aiProviders } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAIModelsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const db = await getDb();
  const rows = await db.select().from(aiModels).orderBy(asc(aiModels.displayName));
  const providers = await db.select().from(aiProviders);
  const provName = new Map((providers as any[]).map((p) => [p.id, p.name]));

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">AI Models</h1>
      <p className="text-sm text-muted mt-1">Enabled models and their capabilities</p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-elevated text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Model ID</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Context</th><th className="px-4 py-3">Streaming</th><th className="px-4 py-3">Images</th><th className="px-4 py-3">Enabled</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(rows as any[]).map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-medium">{m.displayName}</td>
                <td className="px-4 py-3 text-muted font-mono text-xs">{m.modelId}</td>
                <td className="px-4 py-3 text-muted">{provName.get(m.providerId) ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{m.contextWindow ? m.contextWindow.toLocaleString() : "—"}</td>
                <td className="px-4 py-3">{m.supportsStreaming ? "✓" : "—"}</td>
                <td className="px-4 py-3">{m.supportsImages ? "✓" : "—"}</td>
                <td className="px-4 py-3">{m.enabled ? <Badge variant="success">enabled</Badge> : <Badge variant="default">disabled</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
