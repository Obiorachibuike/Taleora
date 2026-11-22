import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { publicStories, stories, projects } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { DashboardShell } from "@/components/layout";
import { Badge, Card, EmptyState } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import type { User } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function PublishedPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const pubRows = await db.select().from(publicStories).orderBy(desc(publicStories.publishedAt));
  const storiesRows = await db.select().from(stories);
  const projRows = await db.select().from(projects).where(eq(projects.userId, user.id));
  const myProjectIds = new Set((projRows as any[]).map((p) => p.id));
  const myStoryIds = new Set((storiesRows as any[]).filter((st) => myProjectIds.has(st.projectId)).map((st) => st.id));
  const rows = (pubRows as any[]).filter((r) => myStoryIds.has(r.storyId));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <DashboardShell user={user} title="Published Stories" crumbs={["Published"]}>
      <p className="text-sm text-muted mb-6">Publish a story to make it publicly readable at your public URL. Only you can publish/unpublish. Private content stays private.</p>
      {rows.length === 0 ? (
        <EmptyState title="Nothing published yet" description="Open a story, publish it, and copy the link." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(rows as any[]).map((s) => (
            <Card key={s.id} title={s.title ?? "Untitled"} action={<Badge variant={s.visibility === "public" ? "success" : "warning"}>{s.visibility ?? "unlisted"}</Badge>}>
              <div className="flex items-center gap-2 text-sm text-muted">
                <span className="truncate">{appUrl}/p/{s.slug}</span>
                <CopyButton text={`${appUrl}/p/${s.slug}`} />
              </div>
              <p className="mt-3 text-xs text-muted">Published {s.publishedAt ? new Date(s.publishedAt).toLocaleDateString() : "—"}</p>
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
