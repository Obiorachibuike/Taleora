import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { projects, stories, chapters, storyOutlines, characters, generationJobs } from "@/lib/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { DashboardShell } from "@/components/layout";
import { Badge, Button, Card, StatCard } from "@/components/ui";
import { Sparkles, ArrowRight, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import type { User } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const rows = await db.select().from(projects).where(eq(projects.id, params.id)).limit(1);
  const project = rows[0];
  if (!project || project.userId !== user.id) notFound();

  const story = (await db.select().from(stories).where(eq(stories.projectId, project.id)).limit(1))[0];
  const outline = (await db.select().from(storyOutlines).where(eq(storyOutlines.projectId, project.id)).limit(1))[0];
  const chaptersRows = await db.select().from(chapters).where(and(eq(chapters.projectId, project.id), isNull(chapters.deletedAt))).orderBy(chapters.index);
  const charRows = await db.select().from(characters).where(and(eq(characters.projectId, project.id), isNull(characters.deletedAt)));
  const jobs = await db.select().from(generationJobs).where(eq(generationJobs.projectId, project.id)).orderBy(desc(generationJobs.createdAt)).limit(5);

  const totalWords = (chaptersRows as any[]).reduce((a: number, c: any) => a + (c.wordCount ?? 0), 0);
  const wordTarget = project.totalWordTarget ?? project.targetChapters * (project.targetWordsPerChapter ?? 1500);

  return (
    <DashboardShell user={user} title={project.title} crumbs={["Stories", project.title]}>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Badge variant={project.status === "completed" ? "success" : project.status === "failed" ? "danger" : "accent"}>{project.status}</Badge>
        <span className="text-sm text-muted">{project.genre ?? "—"} · {project.language ?? "en"}</span>
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/writing-studio?project=${project.id}`} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-canvas hover:bg-accent-dim">Open in Studio</Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <StatCard label="Chapters" value={chaptersRows.length} hint={`${totalWords.toLocaleString()} words`} />
        <StatCard label="Progress" value={`${Math.min(100, Math.round((totalWords / Math.max(1, wordTarget)) * 100))}%`} hint={`Target ${wordTarget.toLocaleString()}`} />
        <StatCard label="Characters" value={charRows.length} hint={(charRows as any[]).map((c) => c.name).slice(0, 3).join(", ") || "—"} />
      </div>

      {outline ? (
        <Card title="Outline" action={<Badge variant={outline.status === "approved" ? "success" : "default"}>{outline.status}</Badge>}>
          <p className="text-muted text-sm leading-relaxed">{outline.synopsis ?? "No synopsis yet."}</p>
          <div className="mt-4 grid gap-2 text-sm">
            {Array.isArray(outline.chaptersMeta) && outline.chaptersMeta.slice(0, 12).map((ch: any, i: number) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-line bg-elevated px-3 py-2">
                <span className="text-xs font-mono text-muted w-6">{i + 1}.</span>
                <div><span className="font-medium">{ch.title ?? `Chapter ${i + 1}`}</span><p className="text-xs text-muted mt-0.5">{ch.summary}</p></div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Link href={`/stories/${project.id}/chapters`} className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-ink hover:bg-elevated">View chapters</Link>
          </div>
        </Card>
      ) : (
        <Card title="Outline" action={<Badge variant="warning">Not generated</Badge>}>
          <p className="text-muted text-sm">No outline yet — generate one with the AI to turn your premise into a chapter-by-chapter plan.</p>
          <OutlineGenerateButton projectId={project.id} />
        </Card>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card title="Recent jobs">
          {jobs.length === 0 ? <p className="text-xs text-muted">No jobs yet.</p> : (
            <ul className="space-y-2">
              {jobs.map((j: any) => (
                <li key={j.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted">{j.jobType.replace(/_/g, " ")}</span>
                  <Badge variant={j.status === "completed" ? "success" : j.status === "failed" ? "danger" : "warning"}>{j.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Characters">
          {charRows.length === 0 ? <p className="text-xs text-muted">No characters yet. Use the Character Studio to generate them.</p> : (
            <ul className="space-y-2">
              {charRows.slice(0, 6).map((c: any) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted">{c.role ?? "character"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
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

import OutlineGenerateButton from "./outline-button";
