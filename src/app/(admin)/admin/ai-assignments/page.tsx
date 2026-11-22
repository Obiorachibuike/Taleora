import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { aiModelAssignments, aiModels } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { Card, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAIAssignmentsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const db = await getDb();
  const rows = await db.select().from(aiModelAssignments).orderBy(asc(aiModelAssignments.task));
  const models = await db.select().from(aiModels);
  const modelById = new Map((models as any[]).map((m) => [m.id, m]));

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Task assignments</h1>
      <p className="text-sm text-muted mt-1">Which model handles which task — no Claude hardcoding, all admin-managed</p>
      <div className="mt-6 space-y-3">
        {(rows as any[]).map((a) => {
          const m = modelById.get(a.modelId);
          return (
            <Card key={a.id} className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-muted uppercase">{a.task}</p>
                  <p className="mt-1 font-semibold">{m?.displayName ?? "—"} <span className="text-xs text-muted font-mono">({m?.modelId ?? a.modelId.slice(0, 8)})</span></p>
                </div>
                <Badge variant={a.isEnabled ? "success" : "default"}>{a.isEnabled ? "enabled" : "disabled"}</Badge>
              </div>
            </Card>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-muted">No assignments — the seed creates defaults.</p>}
      </div>
    </div>
  );
}
