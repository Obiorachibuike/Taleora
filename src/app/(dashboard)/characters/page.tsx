import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { characters, projects } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { DashboardShell } from "@/components/layout";
import { Badge, Card, EmptyState } from "@/components/ui";
import type { User } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function CharactersPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const rows = await db.select().from(characters).where(and(eq(characters.userId, user.id), isNull(characters.deletedAt)));
  const projRows = await db.select().from(projects).where(eq(projects.userId, user.id));
  const projName = new Map((projRows as any[]).map((p) => [p.id, p.title]));

  return (
    <DashboardShell user={user} title="Characters" crumbs={["Characters"]}>
      {rows.length === 0 ? (
        <EmptyState title="No characters yet" description="Generate a character from a story, or add one manually." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(rows as any[]).map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent font-bold">{(c.name ?? "?")[0]}</div>
                <div>
                  <h3 className="font-semibold">{c.name}</h3>
                  <p className="text-xs text-muted">{c.role ?? "character"} · {projName.get(c.projectId) ?? "—"}</p>
                </div>
              </div>
              {c.personality && <p className="mt-3 text-sm text-muted line-clamp-3">{c.personality}</p>}
              {c.background && <p className="mt-2 text-xs text-muted line-clamp-2">{c.background}</p>}
              {c.age && <p className="mt-2 text-xs text-muted">Age: {c.age}</p>}
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
