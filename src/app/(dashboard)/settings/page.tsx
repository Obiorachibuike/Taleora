import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/layout";
import { Card } from "@/components/ui";
import type { User } from "@/lib/db/schema";
import SettingsForm from "./form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const user = session.user;

  return (
    <DashboardShell user={user} title="Settings" crumbs={["Settings"]}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile">
          <SettingsForm user={user} />
        </Card>
        <Card title="Account">
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between border-b border-line pb-2"><span className="text-muted">Email</span><span>{user.email}</span></li>
            <li className="flex items-center justify-between border-b border-line pb-2"><span className="text-muted">Role</span><span>{user.role}</span></li>
            <li className="flex items-center justify-between border-b border-line pb-2"><span className="text-muted">Email verified</span><span>{user.emailVerifiedAt ? "Yes" : "No"}</span></li>
            <li className="flex items-center justify-between"><span className="text-muted">Member since</span><span>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</span></li>
          </ul>
        </Card>
      </div>
    </DashboardShell>
  );
}
