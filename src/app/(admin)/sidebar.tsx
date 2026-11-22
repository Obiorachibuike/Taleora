"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, CreditCard, ShieldCheck, Flag, Brain, BarChart3, HeartPulse, ArrowRight } from "lucide-react";

const adminSections = [
  { href: "/admin/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/plans", label: "Plans", icon: CreditCard },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/ai-providers", label: "AI Providers", icon: Brain },
  { href: "/admin/ai-models", label: "AI Models", icon: Brain },
  { href: "/admin/ai-assignments", label: "Assignments", icon: Brain },
  { href: "/admin/ai-usage", label: "AI Usage", icon: BarChart3 },
  { href: "/admin/audit", label: "Audit Log", icon: ShieldCheck },
  { href: "/admin/flags", label: "Feature Flags", icon: Flag },
  { href: "/admin/health", label: "Health", icon: HeartPulse },
  { href: "/admin/worker-health", label: "Worker Health", icon: HeartPulse },
];

export default function AdminSidebar({ role }: { role: "ADMIN" | "SUPER_ADMIN" }) {
  const pathname = usePathname();
  const sections = adminSections;
  return (
    <aside className="hidden md:block w-56 shrink-0 border-r border-line px-3 py-6">
      <nav className="space-y-0.5">
        {sections.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link key={href} href={href} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${active ? "bg-accent/10 text-accent border border-accent/30" : "text-muted hover:bg-elevated hover:text-ink"}`}>
              <Icon className="h-4 w-4" /> {label}
            </Link>
          );
        })}
        <div className="mt-6 pt-4 border-t border-line">
          <Link href="/dashboard" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:text-ink hover:bg-elevated">Exit admin →</Link>
        </div>
      </nav>
    </aside>
  );
}
