import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users, projects, stories, generationJobs, humanizationJobs, payments, aiProviders } from "@/lib/db/schema";
import { eq, count, sql } from "drizzle-orm";
import { Card, StatCard, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const db = await getDb();

  const [userCount] = await db.select({ c: count() }).from(users);
  const [projCount] = await db.select({ c: count() }).from(projects);
  const [storyCount] = await db.select({ c: count() }).from(stories);
  const [jobCount] = await db.select({ c: count() }).from(generationJobs);
  const [humanizeCount] = await db.select({ c: count() }).from(humanizationJobs);
  const [paymentCount] = await db.select({ c: count() }).from(payments);
  const [pendingPayments] = await db.select({ c: count() }).from(payments).where(eq(payments.status, "pending"));
  const [totalRevenue] = await db.select({ s: sql<number>`COALESCE(SUM(amount_cents), 0)` }).from(payments).where(eq(payments.status, "success"));
  const providers = await db.select().from(aiProviders);
  const healthyProviders = (providers as any[]).filter((p) => p.isEnabled && p.healthStatus === "healthy").length;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Admin overview</h1>
      <p className="text-sm text-muted mt-1">System at a glance — generated live from the database.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={userCount?.c ?? 0} hint={`${healthyProviders}/${providers.length} providers healthy`} />
        <StatCard label="Projects" value={projCount?.c ?? 0} hint={`${storyCount?.c ?? 0} stories`} />
        <StatCard label="Jobs" value={jobCount?.c ?? 0} hint={`${humanizeCount?.c ?? 0} humanizations`} />
        <StatCard label="Payments" value={paymentCount?.c ?? 0} hint={`$${((totalRevenue?.s ?? 0) / 100).toFixed(2)} collected`} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="AI providers">
          <ul className="space-y-2">
            {(providers as any[]).map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span>{p.name}</span>
                <Badge variant={p.healthStatus === "healthy" ? "success" : p.healthStatus === "unhealthy" ? "danger" : "warning"}>{p.healthStatus ?? "unknown"}</Badge>
              </li>
            ))}
            {providers.length === 0 && <li className="text-xs text-muted">No providers configured — add one in AI Providers.</li>}
          </ul>
        </Card>
        <Card title="Pending payments">
          <p className="text-3xl font-bold">{pendingPayments?.c ?? 0}</p>
          <p className="text-xs text-muted mt-1">Pending verifications need review in the Payments page.</p>
        </Card>
      </div>
    </div>
  );
}
