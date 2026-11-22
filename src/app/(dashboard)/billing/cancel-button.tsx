"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";

export default function CancelSubscriptionButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!confirm("Cancel your subscription at the end of the current period?")) return;
    setLoading(true);
    setError(null);
    try {
      await api("/api/v1/subscriptions/cancel", { method: "POST" });
      router.refresh();
    } catch (err: any) { setError(err?.message ?? "Failed to cancel"); }
    finally { setLoading(false); }
  }

  return (
    <div className="mt-4">
      <button onClick={onClick} disabled={loading} className="rounded-lg border border-red-500/40 text-red-400 px-4 py-2 text-sm font-semibold hover:bg-red-500/10 disabled:opacity-50">
        {loading ? "Cancelling…" : "Cancel subscription"}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
