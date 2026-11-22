import * as React from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { getDb } from "@/lib/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session) redirect("/login");
  const user = session!.user;
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="flex">
        <Sidebar user={user} />
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
