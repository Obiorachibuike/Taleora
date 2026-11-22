import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { payments, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { Card, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const db = await getDb();
  const rows = await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(100);
  const usersRows = await db.select().from(users);
  const userById = new Map((usersRows as any[]).map((u) => [u.id, u]));

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Payments</h1>
      <p className="text-sm text-muted mt-1">Webhook-verified payments only — never trust redirects.</p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-elevated text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Ref</th><th className="px-4 py-3">When</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(rows as any[]).map((p) => {
              const u = userById.get(p.userId);
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3 text-muted">{u?.email ?? p.userId.slice(0, 8)}</td>
                  <td className="px-4 py-3">${(p.amountCents / 100).toFixed(2)}</td>
                  <td className="px-4 py-3"><Badge variant={p.status === "success" ? "success" : p.status === "failed" ? "danger" : "warning"}>{p.status}</Badge></td>
                  <td className="px-4 py-3 text-muted">{p.provider}</td>
                  <td className="px-4 py-3 text-xs text-muted font-mono">{p.providerReference ?? p.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-muted">{p.createdAt ? new Date(p.createdAt).toLocaleString() : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
