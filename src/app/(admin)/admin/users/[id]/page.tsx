import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users, projects, generationJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, Badge, StatCard } from "@/components/ui";
import RoleChangeForm from "./role-form";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const admin = session.user;
  const db = await getDb();
  const user = (await db.select().from(users).where(eq(users.id, params.id)).limit(1))[0];
  if (!user) notFound();
  const projectsRows = await db.select().from(projects).where(eq(projects.userId, user.id));
  const jobs = await db.select().from(generationJobs).where(eq(generationJobs.userId, user.id));

  const canEditRole = admin.role === "SUPER_ADMIN" && admin.id !== user.id;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{user.name}</h1>
        <Badge variant={user.role === "SUPER_ADMIN" ? "accent" : user.role === "ADMIN" ? "warning" : "default"}>{user.role}</Badge>
      </div>
      <p className="text-sm text-muted mt-1">{user.email} · joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <StatCard label="Projects" value={projectsRows.length} />
        <StatCard label="Jobs" value={jobs.length} />
        <StatCard label="Status" value={user.status} />
      </div>
      {canEditRole && (
        <Card className="mt-6 p-5" title="Role management">
          <p className="text-xs text-muted mb-3">Only SUPER_ADMIN can change roles. Changes are audited. Self-change is forbidden.</p>
          <RoleChangeForm userId={user.id} currentRole={user.role} />
        </Card>
      )}
      {!canEditRole && admin.role === "SUPER_ADMIN" && (
        <p className="mt-6 text-xs text-amber-400">You cannot change your own role — self-promotion is disabled.</p>
      )}
    </div>
  );
}
