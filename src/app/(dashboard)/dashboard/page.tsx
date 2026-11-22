import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { projects, stories, chapters, generationJobs, humanizationJobs, exportJobs } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import Link from "next/link";
import { DashboardShell } from "@/components/layout";
import { StatCard, Button, Card, Badge, EmptyState } from "@/components/ui";
import { BookOpen, Users, Feather, Sparkles, ArrowRight, Plus } from "lucide-react";
import type { User } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const projRows = await db.select().from(projects).where(eq(projects.userId, user.id));
  const storiesRows = await db.select().from(stories);
  const myStories = (storiesRows as any[]).filter((s) => (projRows as any[]).some((p) => p.id === s.projectId));
  const [chapterCountRow] = await db.select({ c: count() }).from(chapters);
  const myChapters = (await db.select().from(chapters)).filter((c: any) => (projRows as any[]).some((p) => p.id === c.projectId));
  const myJobs = await db.select().from(generationJobs).where(eq(generationJobs.userId, user.id));
  const myHumanize = await db.select().from(humanizationJobs).where(eq(humanizationJobs.userId, user.id));
  const myExports = await db.select().from(exportJobs).where(eq(exportJobs.userId, user.id));

  const totalWords = (myChapters as any[]).reduce((a, c) => a + (c.wordCount ?? 0), 0);
  const completed = (myJobs as any[]).filter((j) => j.status === "completed").length;
  const failed = (myJobs as any[]).filter((j) => j.status === "failed").length;

  const recentProjects = (projRows as any[]).slice(-5).reverse();

  return (
    <DashboardShell user={user} title="Dashboard" crumbs={["Dashboard"]}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Projects" value={projRows.length} icon={<BookOpen className="h-5 w-5" />} hint={`${myStories.length} stories`} />
        <StatCard label="Chapters" value={myChapters.length} icon={<Feather className="h-5 w-5" />} hint={`${totalWords.toLocaleString()} words`} />
        <StatCard label="Humanizations" value={myHumanize.length} icon={<Sparkles className="h-5 w-5" />} hint={`${(myHumanize as any[]).filter((j) => j.status === "completed").length} completed`} />
        <StatCard label="Exports" value={myExports.length} icon={<BookOpen className="h-5 w-5" />} hint={`${myJobs.length} jobs`} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card title="Recent projects" action={<Link href="/stories" className="text-xs text-accent hover:underline">View all →</Link>}>
          {recentProjects.length === 0 ? (
            <EmptyState title="No projects yet" description="Create your first story and the AI will draft it for you." action={<Link href="/stories/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-canvas">New project</Link>} />
          ) : (
            <ul className="divide-y divide-line">
              {recentProjects.map((p: any) => (
                <li key={p.id}>
                  <Link href={`/stories/${p.id}`} className="flex items-center justify-between py-3 hover:bg-elevated px-2 -mx-2 rounded">
                    <span className="font-medium">{p.title}</span>
                    <Badge variant="default">{p.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent activity">
          <ul className="space-y-3 text-sm">
            {(myJobs as any[]).slice(-5).reverse().map((j) => (
              <li key={j.id} className="flex items-center justify-between">
                <span className="text-muted">{j.jobType.replace("_", " ")}</span>
                <Badge variant={j.status === "failed" ? "danger" : j.status === "completed" ? "success" : "default"}>{j.status}</Badge>
              </li>
            ))}
            {myJobs.length === 0 && <li className="text-muted text-xs">No jobs yet — create a project to get started.</li>}
          </ul>
        </Card>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Link href="/writing-studio" className="rounded-xl border border-line bg-surface p-6 hover:border-accent/50 transition-colors">
          <Feather className="h-6 w-6 text-accent" />
          <p className="mt-3 font-semibold">Writing Studio</p>
          <p className="mt-1 text-xs text-muted">Open the editor and start writing</p>
        </Link>
        <Link href="/humanizer" className="rounded-xl border border-line bg-surface p-6 hover:border-accent/50 transition-colors">
          <Sparkles className="h-6 w-6 text-accent" />
          <p className="mt-3 font-semibold">Humanizer</p>
          <p className="mt-1 text-xs text-muted">Turn awkward text into natural prose</p>
        </Link>
        <Link href="/stories/new" className="rounded-xl border border-line bg-surface p-6 hover:border-accent/50 transition-colors">
          <Plus className="h-6 w-6 text-accent" />
          <p className="mt-3 font-semibold">Start a new story</p>
          <p className="mt-1 text-xs text-muted">Build an outline, generate chapters</p>
        </Link>
      </div>
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
