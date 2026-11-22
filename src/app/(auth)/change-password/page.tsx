"use client";
import { useState } from "react";
import { api } from "@/lib/api/client";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      await api("/api/v1/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      setMsg("Password changed. Please sign in again on other devices.");
    } catch (err: any) { setError(err?.message ?? "Failed to change password"); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-xl border border-line bg-surface p-6 space-y-4">
        <h1 className="font-display text-2xl font-bold text-center">Change password</h1>
        <input type="password" required value={currentPassword} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" className="w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent" />
        <input type="password" required minLength={8} value={newPassword} onChange={(e) => setNew(e.target.value)} placeholder="New password (min 8)" className="w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent" />
        {msg && <p className="text-sm text-accent">{msg}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" className="w-full rounded-lg bg-accent py-3 font-bold text-canvas hover:bg-accent-dim">Update password</button>
      </form>
    </main>
  );
}
