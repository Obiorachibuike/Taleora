"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api/client";
import Link from "next/link";

const MODES = ["natural", "emotional", "literary", "conversational", "cinematic", "simple", "professional", "deep"];
const INTENSITIES = ["light", "balanced", "deep"];

export default function HumanizerPage() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("natural");
  const [intensity, setIntensity] = useState("balanced");
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    api<{ jobs: any[] }>("/api/v1/humanization").then((r) => setHistory((r as any).data?.jobs ?? [])).catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setJob(null);
    if (text.trim().length < 20) { setError("Please enter at least 20 characters."); return; }
    setLoading(true);
    try {
      const res = await api<{ job: any }>("/api/v1/humanization", { method: "POST", body: JSON.stringify({ text, mode, intensity }) });
      setJob((res as any).data?.job ?? null);
      pollJob((res as any).data?.job?.id);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create humanization job");
      setLoading(false);
    }
  }

  async function pollJob(id: string) {
    const started = Date.now();
    while (Date.now() - started < 120000) {
      try {
        const res = await api<{ job: any }>(`/api/v1/humanization/${id}`);
        setJob((res as any).data?.job ?? null);
        const status = (res as any).data?.job?.status;
        if (status === "completed" || status === "failed" || status === "cancelled") {
          setLoading(false);
          return;
        }
      } catch { /* keep polling */ }
      await new Promise((r) => setTimeout(r, 2000));
    }
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-accent">AI Humanizer</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Natural, expressive prose — your style preserved</h1>
        <p className="mt-2 text-muted">Not a synonym swap. Your meaning, characters and story continuity are kept — only the rhythm and the voice are transformed.</p>
      </div>

      <form onSubmit={onSubmit} className="rounded-2xl border border-line bg-surface p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">Mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="mt-1 w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent">
              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">Intensity</span>
            <select value={intensity} onChange={(e) => setIntensity(e.target.value)} className="mt-1 w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent">
              {INTENSITIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
        </div>
        <label className="block mt-4">
          <span className="text-xs uppercase tracking-wide text-muted">Your text</span>
          <textarea required minLength={20} rows={12} value={text} onChange={(e) => setText(e.target.value)} className="mt-1 w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent" placeholder="Paste or write the passage you want to transform…" />
        </label>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <button disabled={loading} type="submit" className="mt-4 w-full rounded-lg bg-accent py-4 font-bold text-canvas hover:bg-accent-dim disabled:opacity-50">
          {loading ? "Processing — this can take a moment…" : "Humanize with AI"}
        </button>
      </form>

      {job && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-6">
            <p className="text-xs uppercase tracking-wide text-muted">Status</p>
            <p className="mt-2 text-2xl font-bold">{job.status}</p>
            {job.progress !== undefined && <p className="text-sm text-muted mt-1">{job.progress}% — {job.currentStage ?? "…"}</p>}
            {job.warnings?.length > 0 && (
              <ul className="mt-3 text-xs text-amber-400">{job.warnings.slice(0, 5).map((w: string, i: number) => <li key={i}>• {w}</li>)}</ul>
            )}
          </div>
          <div className="rounded-2xl border border-line bg-surface p-6">
            <p className="text-xs uppercase tracking-wide text-muted">Result</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-ink leading-relaxed max-h-96 overflow-y-auto">{job.resultText ?? (job.status === "completed" ? "" : "Still processing…")}</pre>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-xl font-bold">History</h2>
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {history.slice(0, 10).map((h: any) => (
              <li key={h.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{h.mode} · {h.intensity}</p>
                  <p className="text-xs text-muted">{new Date(h.createdAt).toLocaleString()}</p>
                </div>
                <span className="text-xs text-muted">{h.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
