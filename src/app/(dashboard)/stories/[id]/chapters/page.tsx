import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { projects, chapters } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { DashboardShell } from "@/components/layout";
import { Badge, Card, EmptyState } from "@/components/ui";
import { ArrowRight, Plus } from "lucide-react";
import type { User } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function ChaptersPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const project = (await db.select().from(projects).where(eq(projects.id, params.id)).limit(1))[0];
  if (!project || project.userId !== user.id) notFound();
  const rows = await db.select().from(chapters).where(and(eq(chapters.projectId, project.id), isNull(chapters.deletedAt))).orderBy(chapters.index);

  return (
    <DashboardShell user={user} title="Chapters" crumbs={["Stories", project.title, "Chapters"]}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">{rows.length} chapter{rows.length === 1 ? "" : "s"} · {rows.reduce((a: number, c: any) => a + (c.wordCount ?? 0), 0).toLocaleString()} words</p>
        <Link href={`/stories/${project.id}/chapters/new`} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-canvas hover:bg-accent-dim inline-flex items-center gap-2">
          <Plus className="h-4 w-4" /> New chapter
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No chapters yet" description="Generate chapters with the AI, or write them yourself." action={<Link href={`/stories/${project.id}`} className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-ink">Back to project</Link>} />
      ) : (
        <div className="grid gap-3">
          {rows.map((c: any) => (
            <Link key={c.id} href={`/stories/${project.id}/chapters/${c.id}`} className="rounded-xl border border-line bg-surface p-4 hover:border-accent/40 transition-colors flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted">Ch. {c.index + 1}</span>
                  <h3 className="font-semibold">{c.title ?? `Chapter ${c.index + 1}`}</h3>
                </div>
                <p className="mt-1 text-xs text-muted">{(c.wordCount ?? 0).toLocaleString()} words · v{c.version}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={c.status === "completed" ? "success" : "default"}>{c.status ?? "draft"}</Badge>
                <ArrowRight className="h-4 w-4 text-muted" />
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
