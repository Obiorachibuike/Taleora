import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { adminAuditLogs, users } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const db = await getDb();
  const rows = await db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(100);
  const usersRows = await db.select().from(users);
  const userById = new Map((usersRows as any[]).map((u) => [u.id, u]));

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Audit log</h1>
      <p className="text-sm text-muted mt-1">Privileged admin actions are logged and immutable.</p>
      <div className="mt-6 space-y-2">
        {(rows as any[]).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <div>
              <p className="text-sm font-medium">{r.action}</p>
              <p className="text-xs text-muted">{r.targetType ? `${r.targetType} · ${r.targetId?.slice(0, 8)}` : "—"} · {userById.get(r.actorId)?.email ?? "unknown"}</p>
            </div>
            <div className="text-xs text-muted">{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted">No audit entries yet.</p>}
      </div>
    </div>
  );
}
