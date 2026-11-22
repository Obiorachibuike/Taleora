import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { projects, chapters } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { DashboardShell } from "@/components/layout";
import type { User } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function ChapterPage({ params }: { params: { id: string; chapterId: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const project = (await db.select().from(projects).where(eq(projects.id, params.id)).limit(1))[0];
  if (!project || project.userId !== user.id) notFound();
  const chapter = (await db.select().from(chapters).where(eq(chapters.id, params.chapterId)).limit(1))[0];
  if (!chapter || chapter.projectId !== project.id) notFound();

  return (
    <DashboardShell user={user} title={chapter.title ?? `Chapter ${chapter.index + 1}`} crumbs={["Stories", project.title, "Chapters"]}>
      <article className="mx-auto max-w-3xl">
        <p className="text-xs uppercase tracking-[0.3em] text-muted">Chapter {chapter.index + 1} · {chapter.status ?? "draft"} · v{chapter.version}</p>
        <h1 className="mt-3 font-display text-3xl font-bold">{chapter.title ?? `Chapter ${chapter.index + 1}`}</h1>
        <div className="prose-taleora mt-8" dangerouslySetInnerHTML={{ __html: chapter.content ?? "<p></p>" }} />
        <div className="mt-10 rounded-xl border border-line bg-surface p-4 text-sm">
          <p className="text-muted">{chapter.wordCount ?? 0} words · edits save automatically via the Writing Studio</p>
        </div>
      </article>
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
