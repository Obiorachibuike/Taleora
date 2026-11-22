"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";

export default function FlagToggle({ id, enabled: initial }: { id: string; enabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await api(`/api/v1/admin/flags/${id}`, { method: "PATCH", body: JSON.stringify({ enabled: !enabled }) });
      setEnabled(!enabled);
      router.refresh();
    } catch { /* ignore */ } finally { setBusy(false); }
  }

  return (
    <button onClick={toggle} disabled={busy} className={`relative h-7 w-12 rounded-full transition-colors ${enabled ? "bg-accent" : "bg-elevated border border-line"}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}
