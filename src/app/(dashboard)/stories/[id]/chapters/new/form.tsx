"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";

export default function CreateChapterForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api(`/api/v1/projects/${projectId}/chapters`, { method: "POST", body: JSON.stringify({ title: title || "Untitled", content, index }) });
      router.replace(`/stories/${projectId}/chapters`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create chapter");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-muted">Title</span>
        <input className="mt-1 w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chapter One" />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-muted">Content</span>
        <textarea required rows={14} value={content} onChange={(e) => setContent(e.target.value)} className="mt-1 w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent" placeholder="Write the chapter…" />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="rounded-lg bg-accent px-6 py-3 font-bold text-canvas hover:bg-accent-dim disabled:opacity-50">{loading ? "Saving…" : "Create chapter"}</button>
      </div>
    </form>
  );
}
