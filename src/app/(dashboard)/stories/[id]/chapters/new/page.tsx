import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DashboardShell } from "@/components/layout";
import type { User } from "@/lib/db/schema";
import CreateChapterForm from "./form";

export const dynamic = "force-dynamic";

export default async function NewChapterPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const project = (await db.select().from(projects).where(eq(projects.id, params.id)).limit(1))[0];
  if (!project || project.userId !== user.id) notFound();

  return (
    <DashboardShell user={user} title="New chapter" crumbs={["Stories", project.title, "Chapters", "New"]}>
      <div className="mx-auto max-w-2xl">
        <Link href={`/stories/${project.id}/chapters`} className="text-sm text-muted hover:text-ink">← Back to chapters</Link>
        <h1 className="mt-4 font-display text-3xl font-bold">New chapter</h1>
        <CreateChapterForm projectId={project.id} />
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
