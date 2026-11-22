import { Sidebar } from "@/components/dashboard/sidebar";
import type { User } from "@/lib/db/schema";

export function DashboardShell({ children, user, title, crumbs }: { children: React.ReactNode; user: User; title: string; crumbs?: string[] }) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Sidebar user={user} />
      <main className="md:pl-64">
        <div className="sticky top-0 z-10 border-b border-line bg-canvas/90 backdrop-blur">
          <div className="px-6 lg:px-10 py-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted">{crumbs?.join(" / ") ?? "Taleora"}</p>
              <h1 className="font-display text-xl font-bold">{title}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? "bg-accent/10 text-accent" : "bg-elevated text-muted"}`}>
                  {user.role.replace("_", " ")}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="px-6 lg:px-10 py-8">{children}</div>
      </main>
    </div>
  );
}
