"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";

export default function RoleChangeForm({ userId, currentRole }: { userId: string; currentRole: string }) {
  const router = useRouter();
  const [role, setRole] = useState(currentRole);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api(`/api/v1/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
      router.refresh();
    } catch (err: any) { setError(err?.message ?? "Failed"); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-3">
      <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg bg-canvas border border-line px-3 py-2 text-ink">
        <option value="USER">USER</option>
        <option value="ADMIN">ADMIN</option>
        <option value="SUPER_ADMIN">SUPER_ADMIN</option>
      </select>
      <button type="submit" disabled={loading || role === currentRole} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-canvas disabled:opacity-50">{loading ? "Saving…" : "Update"}</button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </form>
  );
}
