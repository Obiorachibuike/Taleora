"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";

export default function OutlineGenerateButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      await api("/api/v1/generation/outline", { method: "POST", body: JSON.stringify({ projectId }) });
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Failed to enqueue outline generation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      <button onClick={onClick} disabled={loading} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-canvas hover:bg-accent-dim disabled:opacity-50">
        {loading ? "Enqueuing…" : "Generate outline"}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <p className="mt-2 text-xs text-muted">Generation runs in the background — refresh in a moment.</p>
    </div>
  );
}
