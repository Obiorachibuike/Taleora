import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionWithUser } from "@/lib/auth/session";
import type { User } from "@/lib/db/schema";
import AdminSidebar from "./sidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const role = (session.user as User).role;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-canvas font-bold">T</div>
            <span className="font-display font-bold">Taleora</span>
          </div>
          <span className="text-muted text-sm">/</span>
          <span className="text-xs uppercase tracking-[0.3em] text-accent">Admin</span>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1400px]">
        <AdminSidebar role={role as "ADMIN" | "SUPER_ADMIN"} />
        <main className="flex-1 px-6 lg:px-10 py-8">{children}</main>
      </div>
    </div>
  );
}
