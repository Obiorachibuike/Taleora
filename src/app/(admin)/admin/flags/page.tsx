import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { featureFlags } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { Badge, Card } from "@/components/ui";
import FlagToggle from "./toggle";

export const dynamic = "force-dynamic";

export default async function AdminFlagsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const db = await getDb();
  const rows = await db.select().from(featureFlags).orderBy(asc(featureFlags.key));

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Feature flags</h1>
      <p className="text-sm text-muted mt-1">Toggle experimental capabilities without redeployment.</p>
      <div className="mt-6 space-y-3">
        {(rows as any[]).map((f) => (
          <Card key={f.id} className="p-5 flex items-center justify-between">
            <div>
              <p className="font-medium">{f.key}</p>
              {f.description && <p className="text-xs text-muted">{f.description}</p>}
            </div>
            <FlagToggle id={f.id} enabled={f.enabled} />
          </Card>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted">No flags configured.</p>}
      </div>
    </div>
  );
}
