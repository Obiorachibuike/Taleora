import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { subscriptions, creditAccounts, plans } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { DashboardShell } from "@/components/layout";
import { Card, Badge, StatCard } from "@/components/ui";
import type { User } from "@/lib/db/schema";
import CancelSubscriptionButton from "./cancel-button";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const user = session.user;
  const db = await getDb();
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).orderBy(subscriptions.createdAt);
  const credits = (await db.select().from(creditAccounts).where(eq(creditAccounts.userId, user.id)).limit(1))[0];
  const plan = subs[0] ? (await db.select().from(plans).where(eq(plans.id, subs[0].planId)).limit(1))[0] : null;

  return (
    <DashboardShell user={user} title="Billing" crumbs={["Billing"]}>
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <StatCard label="Plan" value={plan?.name ?? "Free"} hint={plan?.code ?? "—"} />
        <StatCard label="Credits" value={credits?.balance ?? 0} hint={`Allocated ${credits?.allocated ?? 0}`} />
        <StatCard label="Status" value={subs[0]?.status ?? "none"} hint={subs[0]?.currentPeriodEnd ? `Ends ${new Date(subs[0].currentPeriodEnd).toLocaleDateString()}` : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Your subscription" action={<Badge variant={subs[0]?.status === "active" ? "success" : "default"}>{subs[0]?.status ?? "none"}</Badge>}>
          {subs[0] ? (
            <>
              <p className="text-sm text-muted">
                {plan?.name} · {subs[0].interval ?? "monthly"} · since {subs[0].createdAt ? new Date(subs[0].createdAt).toLocaleDateString() : "—"}
              </p>
              {!subs[0].cancelAtPeriodEnd ? (
                <CancelSubscriptionButton />
              ) : (
                <p className="mt-3 text-sm text-amber-400">Cancels at end of current period.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">No subscription yet.</p>
          )}
        </Card>
        <Card title="Plans">
          <ul className="space-y-2 text-sm">
            <PlanRow name="Free" price="$0" features="2 projects · 5 humanizations · 20 credits" />
            <PlanRow name="Starter" price="$19.99/mo" features="10 projects · 20 humanizations · exports" />
            <PlanRow name="Pro" price="$49.99/mo" features="50 projects · 100 humanizations · story memory" />
            <PlanRow name="Premium" price="$99.99/mo" features="200 projects · 500 humanizations · all models" />
          </ul>
        </Card>
      </div>
    </DashboardShell>
  );
}

function PlanRow({ name, price, features }: { name: string; price: string; features: string }) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-line bg-elevated px-3 py-2">
      <div><p className="font-semibold">{name}</p><p className="text-xs text-muted">{features}</p></div>
      <span className="text-sm text-accent">{price}</span>
    </li>
  );
}
