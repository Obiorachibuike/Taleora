import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { projects, storyMemories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DashboardShell } from "@/components/layout";
import { Card, EmptyState, Badge } from "@/components/ui";
import type { User } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const projRows = await db.select().from(projects).where(eq(projects.userId, user.id));
  const projIds = (projRows as any[]).map((p) => p.id);
  const memoryRows = projIds.length ? await db.select().from(storyMemories).where(eq(storyMemories.projectId, projIds[0])) : [];

  // get per-project memory counts
  const counts = await Promise.all(projIds.map(async (id) => {
    const rows = await db.select().from(storyMemories).where(eq(storyMemories.projectId, id));
    return { project: (projRows as any[]).find((p) => p.id === id), count: rows.length, facts: rows.reduce((a: number, r: any) => a + (r.factsCount ?? 0), 0), events: rows.reduce((a: number, r: any) => a + (r.eventsCount ?? 0), 0) };
  }));

  return (
    <DashboardShell user={user} title="Story Memory" crumbs={["Memory"]}>
      <p className="text-muted text-sm mb-6">Every project has its own memory — characters, timeline, world facts and plot events, kept explicitly so your manuscript never contradicts itself.</p>
      {counts.length === 0 ? (
        <EmptyState title="No projects yet" description="Create a project and generate chapters to build memory." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {counts.map((c) => (
            <Card key={c.project?.id} title={c.project?.title ?? "Untitled"} action={<Badge variant="accent">{c.facts} facts</Badge>}>
              <p className="text-xs text-muted">{c.count} memory records · {c.events} events</p>
              <Link href={`/stories/${c.project?.id}`} className="mt-3 inline-block text-sm text-accent hover:underline">Open project →</Link>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}

async function currentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  if (!token) return null;
  const session = await getSessionWithUser(token);
  return session?.user ?? null;
}
