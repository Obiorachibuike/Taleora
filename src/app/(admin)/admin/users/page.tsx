import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users, projects, generationJobs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { Badge, Card } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const db = await getDb();
  const rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(100);
  const projCounts = await db.select().from(projects);
  const jobs = await db.select().from(generationJobs);
  const projByUser = new Map<string, number>();
  for (const p of projCounts as any[]) projByUser.set(p.userId, (projByUser.get(p.userId) ?? 0) + 1);
  const jobByUser = new Map<string, number>();
  for (const j of jobs as any[]) jobByUser.set(j.userId, (jobByUser.get(j.userId) ?? 0) + 1);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Users</h1>
      <p className="text-sm text-muted mt-1">{rows.length} users (showing latest 100)</p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-elevated text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Projects</th><th className="px-4 py-3">Jobs</th><th className="px-4 py-3">Joined</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(rows as any[]).map((u) => (
              <tr key={u.id} className="hover:bg-elevated/50">
                <td className="px-4 py-3"><Link href={`/admin/users/${u.id}`} className="text-ink hover:text-accent">{u.name}</Link></td>
                <td className="px-4 py-3 text-muted">{u.email}</td>
                <td className="px-4 py-3"><Badge variant={u.role === "SUPER_ADMIN" ? "accent" : u.role === "ADMIN" ? "warning" : "default"}>{u.role}</Badge></td>
                <td className="px-4 py-3">{u.status}</td>
                <td className="px-4 py-3">{projByUser.get(u.id) ?? 0}</td>
                <td className="px-4 py-3">{jobByUser.get(u.id) ?? 0}</td>
                <td className="px-4 py-3 text-muted">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
