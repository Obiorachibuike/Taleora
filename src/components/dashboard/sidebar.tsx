"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, BookOpen, PenTool, Sparkles, Feather, Users, Brain, LayoutTemplate,
  Globe2, Gauge, CreditCard, Settings, ShieldCheck, Menu, X, ChevronRight,
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/stories", label: "My Stories", icon: BookOpen },
  { href: "/stories/new", label: "Create Story", icon: PenTool },
  { href: "/humanizer", label: "AI Humanizer", icon: Sparkles },
  { href: "/writing-studio", label: "Writing Studio", icon: Feather },
  { href: "/characters", label: "Character Studio", icon: Users },
  { href: "/memory", label: "Story Memory", icon: Brain },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/published", label: "Published Stories", icon: Globe2 },
  { href: "/ai-usage", label: "AI Usage", icon: Gauge },
  { href: "/billing", label: "Subscription & Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ user }: { user: { name: string; email: string; role: string } }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const isActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href) && href !== "/dashboard");

  const content = (
    <>
      <div className="flex items-center gap-3 px-4 pt-6 pb-5 border-b border-line">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-canvas font-bold text-xl">T</div>
        <div>
          <p className="font-display text-lg font-bold leading-none text-ink">Taleora</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted mt-0.5">Where stories find their voice</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-elevated text-accent font-semibold" : "text-muted hover:text-ink hover:bg-elevated/60"}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        {(user.role === "ADMIN" || user.role === "SUPER_ADMIN") && (
          <div className="mt-6 border-t border-line pt-4">
            <Link href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:text-accent hover:bg-elevated/60 transition-colors">
              <ShieldCheck className="h-4 w-4" />
              Admin Dashboard
            </Link>
          </div>
        )}
      </nav>
      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-elevated text-sm font-semibold text-accent">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <ChevronRight className="ml-auto h-4 w-4 text-muted" />
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* mobile top bar */}
      <div className="lg:hidden flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-accent text-canvas font-bold text-lg">T</div>
          <span className="font-display text-base font-bold text-ink">Taleora</span>
        </div>
        <button aria-label="Toggle menu" onClick={() => setOpen((v) => !v)} className="rounded-md border border-line p-2 text-ink">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 bg-canvas/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
      )}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface transition-transform ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        {content}
      </aside>
    </>
  );
}
