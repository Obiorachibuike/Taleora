import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { projects, stories, chapters } from "@/lib/db/schema";
import { eq, desc, isNull } from "drizzle-orm";
import { DashboardShell } from "@/components/layout";
import { Button, Badge, StatCard, Card, EmptyState } from "@/components/ui";
import { BookOpen, Plus, ArrowRight, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import type { User } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const rows = await db.select().from(projects).where(eq(projects.userId, user.id)).orderBy(desc(projects.updatedAt));
  const storiesRows = await db.select().from(stories);
  const chaptersRows = await db.select().from(chapters);

  const withCounts = (rows as any[]).map((p) => {
    const story = (storiesRows as any[]).find((s) => s.projectId === p.id);
    const chs = (chaptersRows as any[]).filter((c) => c.projectId === p.id && !c.deletedAt);
    const words = chs.reduce((a: number, c: any) => a + (c.wordCount ?? 0), 0);
    return { ...p, story, chapterCount: chs.length, wordCount: words };
  });

  const totalWords = withCounts.reduce((a: number, p: any) => a + p.wordCount, 0);

  return (
    <DashboardShell user={user} title="My Stories" crumbs={["Stories"]}>
      <div className="flex items-center justify-between mb-6">
        <div className="text-sm text-muted">{withCounts.length} project{withCounts.length === 1 ? "" : "s"} · {totalWords.toLocaleString()} words</div>
        <Link href="/stories/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-canvas hover:bg-accent-dim inline-flex items-center gap-2">
          <Plus className="h-4 w-4" /> New story
        </Link>
      </div>
      {withCounts.length === 0 ? (
        <EmptyState title="No stories yet" description="Start your first story. The AI can outline it, draft chapters, and keep it consistent." action={<Link href="/stories/new" className="rounded-lg bg-accent px-5 py-2.5 font-bold text-canvas">Create your first story</Link>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {withCounts.map((p: any) => (
            <Link key={p.id} href={`/stories/${p.id}`} className="rounded-xl border border-line bg-surface p-5 hover:border-accent/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-lg">{p.title}</h3>
                  <p className="mt-1 text-xs text-muted uppercase tracking-wide">{p.genre ?? "Uncategorized"} · {p.status}</p>
                </div>
                <Badge variant={p.status === "completed" ? "success" : p.status === "failed" ? "danger" : "default"}>{p.status}</Badge>
              </div>
              {p.premise && <p className="mt-3 text-sm text-muted line-clamp-2">{p.premise}</p>}
              <div className="mt-4 flex items-center justify-between text-xs text-muted border-t border-line pt-3">
                <span>{p.chapterCount} chapters</span>
                <span>{p.wordCount.toLocaleString()} words</span>
                <span className="inline-flex items-center gap-1 text-accent">Open <ArrowRight className="h-3 w-3" /></span>
              </div>
            </Link>
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
