import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const db = await getDb();
  const rows = await db.select().from(plans).orderBy(plans.sortOrder);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Plans & billing</h1>
      <p className="text-sm text-muted mt-1">All plans, entitlements and credits</p>
      <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {(rows as any[]).map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">{p.name}</h3>
              <Badge variant={p.isActive ? "success" : "default"}>{p.isActive ? "active" : "inactive"}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">${(p.monthlyPriceCents / 100).toFixed(2)}/mo</p>
            <ul className="mt-4 space-y-1.5 text-xs text-muted">
              <li>{p.generationCredits} credits</li>
              <li>{p.maxProjects} projects</li>
              <li>{p.humanizationLimit} humanizations</li>
              <li>{p.maxChapters} chapters</li>
              <li>{p.exportEnabled ? "Exports enabled" : "No exports"}</li>
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
