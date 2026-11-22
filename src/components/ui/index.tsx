"use client";
import * as React from "react";

export function Button({
  variant = "default",
  size = "default",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive" | "accent";
  size?: "sm" | "default" | "lg" | "icon";
}) {
  const base = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50 disabled:pointer-events-none";
  const variants: Record<string, string> = {
    default: "bg-ink text-canvas hover:bg-ink/90",
    accent: "bg-accent text-canvas hover:bg-accent-dim shadow-glow",
    secondary: "bg-elevated text-ink border border-line hover:bg-surface",
    outline: "border border-line text-ink hover:bg-elevated",
    ghost: "text-ink hover:bg-elevated",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-xs",
    default: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
    icon: "h-9 w-9",
  };
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}

export function Card({ className = "", title, action, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { title?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-line bg-surface shadow-panel ${className}`} {...props}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          {title && <h2 className="font-semibold text-ink">{title}</h2>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={title || action ? "px-5 py-4" : ""}>{children}</div>
    </div>
  );
}

export function Badge({ className = "", variant = "default", ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "success" | "danger" | "warning" | "accent" }) {
  const variants: Record<string, string> = {
    default: "bg-elevated text-muted border-line",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    danger: "bg-red-500/10 text-red-400 border-red-500/30",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    accent: "bg-accent/10 text-accent border-accent/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${variants[variant] ?? variants.default} ${className}`} {...props} />
  );
}

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-10 w-full rounded-md border border-line bg-elevated px-3 text-sm text-ink placeholder:text-muted/50 outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-md border border-line bg-elevated p-3 text-sm text-ink placeholder:text-muted/50 outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-10 w-full rounded-md border border-line bg-elevated px-3 text-sm text-ink outline-none focus:border-accent/50 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className = "", ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`text-xs font-semibold uppercase tracking-wide text-muted ${className}`} {...props} />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-elevated ${className}`} />;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface px-6 py-16 text-center">
      <div className="mb-3 h-10 w-10 rounded-full bg-elevated" />
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon }: { label: string; value: string | number; hint?: string; icon?: React.ReactNode }) {
  return (
    <Card className="p-5 flex items-center gap-4">
      {icon && <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 text-accent">{icon}</div>}
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
    </Card>
  );
}
