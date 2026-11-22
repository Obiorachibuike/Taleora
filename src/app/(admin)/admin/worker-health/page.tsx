import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { generationJobs } from "@/lib/db/schema";
import { desc, count, eq } from "drizzle-orm";
import { Card, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminWorkerHealthPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const db = await getDb();
  const queue = await db.select({ status: generationJobs.status, c: count() }).from(generationJobs).groupBy(generationJobs.status);
  const recent = await db.select().from(generationJobs).orderBy(desc(generationJobs.createdAt)).limit(10);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Worker health</h1>
      <p className="text-sm text-muted mt-1">Queue status — live from the database</p>
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {(queue as any[]).map((q) => (
          <Card key={q.status} className="p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-muted">{q.status}</p>
            <p className="text-2xl font-bold mt-1">{q.c}</p>
          </Card>
        ))}
        {queue.length === 0 && <p className="text-sm text-muted">No jobs in the queue.</p>}
      </div>
      <h2 className="mt-8 font-display text-xl font-bold">Recent jobs</h2>
      <div className="mt-4 space-y-2">
        {(recent as any[]).map((j) => (
          <div key={j.id} className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-2.5 text-sm">
            <div><p className="font-medium">{j.jobType.replace(/_/g, " ")}</p><p className="text-xs text-muted">{j.id.slice(0, 8)} · {j.progress}%</p></div>
            <Badge variant={j.status === "completed" ? "success" : j.status === "failed" ? "danger" : "warning"}>{j.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
