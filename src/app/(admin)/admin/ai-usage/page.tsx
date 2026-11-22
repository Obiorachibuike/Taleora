import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { aiModelUsage, aiModels } from "@/lib/db/schema";
import { desc, sql, eq } from "drizzle-orm";
import { Card, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAIUsagePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const db = await getDb();
  const rows = await db.select({
    modelName: aiModels.displayName,
    task: aiModelUsage.task,
    tokensIn: sql<number>`sum(${aiModelUsage.tokensIn})::int`,
    tokensOut: sql<number>`sum(${aiModelUsage.tokensOut})::int`,
    calls: sql<number>`count(*)::int`,
  }).from(aiModelUsage).leftJoin(aiModels, eq(aiModelUsage.modelId, aiModels.id)).groupBy(aiModels.displayName, aiModelUsage.task).orderBy(desc(sql`count(*)`)).limit(50);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">AI Usage</h1>
      <p className="text-sm text-muted mt-1">Tracked per model + task — including admin usage (never charged, always tracked)</p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-elevated text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3">Model</th><th className="px-4 py-3">Task</th><th className="px-4 py-3">Calls</th><th className="px-4 py-3">Tokens In</th><th className="px-4 py-3">Tokens Out</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(rows as any[]).map((r, i) => (
              <tr key={i}>
                <td className="px-4 py-3 font-medium">{r.modelName ?? "—"}</td>
                <td className="px-4 py-3 text-muted font-mono text-xs">{r.task}</td>
                <td className="px-4 py-3">{r.calls}</td>
                <td className="px-4 py-3 text-muted">{r.tokensIn?.toLocaleString() ?? 0}</td>
                <td className="px-4 py-3 text-muted">{r.tokensOut?.toLocaleString() ?? 0}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted text-sm">No AI usage recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

