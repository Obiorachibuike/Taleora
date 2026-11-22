import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionWithUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/layout";
import WritingStudioClient from "./client";

export const dynamic = "force-dynamic";

export default async function WritingStudioPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  return (
    <DashboardShell user={session.user} title="Writing Studio" crumbs={["Writing Studio"]}>
      <WritingStudioClient />
    </DashboardShell>
  );
}
