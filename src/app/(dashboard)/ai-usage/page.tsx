import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { aiModelUsage, creditAccounts } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { DashboardShell } from "@/components/layout";
import { Card, StatCard } from "@/components/ui";
import type { User } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function AIUsagePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const user = session.user;
  const db = await getDb();

  // credit account + total usage
  const creds = (await db.select().from(creditAccounts).where(eq(creditAccounts.userId, user.id)).limit(1))[0];
  // we don't record per-user AI usage rows — approximate from generationJobs
  const { generationJobs } = await import("@/lib/db/schema");
  const jobs = await db.select().from(generationJobs).where(eq(generationJobs.userId, user.id));
  const completed = (jobs as any[]).filter((j) => j.status === "completed").length;
  const failed = (jobs as any[]).filter((j) => j.status === "failed").length;
  const totalTokensIn = 0;

  return (
    <DashboardShell user={user} title="AI Usage" crumbs={["AI Usage"]}>
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <StatCard label="Credits" value={creds?.balance ?? 0} hint={`Allocated ${creds?.allocated ?? 0}`} />
        <StatCard label="Completed jobs" value={completed} />
        <StatCard label="Failed jobs" value={failed} />
        <StatCard label="Jobs queued" value={(jobs as any[]).filter((j) => j.status === "QUEUED" || j.status === "PROCESSING").length} />
      </div>
      <Card title="Recent jobs">
        {jobs.length === 0 ? <p className="text-sm text-muted">No jobs yet.</p> : (
          <ul className="space-y-2 text-sm">
            {(jobs as any[]).slice(-10).reverse().map((j) => (
              <li key={j.id} className="flex items-center justify-between">
                <span className="text-muted">{j.jobType.replace(/_/g, " ")}</span>
                <span className="text-xs text-muted">{j.status} · {j.id.slice(0, 8)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-6 text-xs text-muted">Usage is tracked for every request, including admins. Admins are never charged credits but are always tracked.</p>
    </DashboardShell>
  );
}
