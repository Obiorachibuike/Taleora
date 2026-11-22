"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";

export default function SettingsForm({ user }: { user: any }) {
  const router = useRouter();
  const [name, setName] = useState(user.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    try {
      await api("/api/v1/users/me", { method: "PATCH", body: JSON.stringify({ name, avatarUrl: avatarUrl || null }) });
      setMsg("Profile updated");
      router.refresh();
    } catch (err: any) { setError(err?.message ?? "Failed to update"); }
  }

  async function onAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { setError("Image must be under 4MB"); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    try {
      await api("/api/v1/uploads/avatar", { method: "POST", body: JSON.stringify({ url: dataUrl }) });
      setMsg("Avatar updated");
      router.refresh();
    } catch (err: any) { setError(err?.message ?? "Upload failed"); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-muted">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg bg-canvas border border-line px-4 py-2.5 text-ink focus:outline-none focus:border-accent" />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-muted">Avatar (URL)</span>
        <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className="mt-1 w-full rounded-lg bg-canvas border border-line px-4 py-2.5 text-ink focus:outline-none focus:border-accent" placeholder="https://…" />
      </label>
      <label className="block text-sm text-muted border border-dashed border-line rounded-lg p-4 text-center cursor-pointer hover:border-accent/40">
        Upload avatar (under 4MB)
        <input type="file" accept="image/*" className="hidden" onChange={onAvatarUpload} />
      </label>
      <button type="submit" className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-canvas hover:bg-accent-dim">Save</button>
      {msg && <p className="text-sm text-accent">{msg}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
