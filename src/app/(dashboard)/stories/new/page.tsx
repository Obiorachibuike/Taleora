"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api/client";

const GENRES = ["Fantasy", "Sci-Fi", "Mystery", "Romance", "Thriller", "Horror", "Historical", "Literary", "Adventure", "Magical Realism", "Western", "Dystopian", "Other"];

export default function NewStoryPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    genre: "Fantasy",
    premise: "",
    tone: "",
    setting: "",
    conflict: "",
    endingGoal: "",
    targetChapters: 8,
    language: "en",
    themes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ project: any }>("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          genre: form.genre,
          premise: form.premise || undefined,
          tone: form.tone || undefined,
          setting: form.setting || undefined,
          conflict: form.conflict || undefined,
          endingGoal: form.endingGoal || undefined,
          targetChapters: form.targetChapters,
          language: form.language,
          themes: form.themes ? form.themes.split(",").map((t) => t.trim()).filter(Boolean) : [],
        }),
      });
      router.replace(`/stories/${res.data.project.id}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create project");
      setLoading(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <Link href="/stories" className="text-sm text-muted hover:text-ink">← Back to stories</Link>
      <h1 className="mt-6 font-display text-4xl font-bold">New story</h1>
      <p className="mt-2 text-muted">Tell us what you imagine — the AI will turn it into a chapter-by-chapter plan.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-5 rounded-2xl border border-line bg-surface p-6">
        <Field label="Title">
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="The Hollow Crown" />
        </Field>
        <Field label="Genre">
          <select value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} className={inputCls}>
            {GENRES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Premise">
          <textarea required minLength={10} value={form.premise} onChange={(e) => setForm({ ...form, premise: e.target.value })} rows={4} className={inputCls} placeholder="A mercenary discovers that the war was caused by the very empire she serves…" />
        </Field>
        <div className="grid md:grid-cols-2 gap-5">
          <Field label="Tone">
            <input value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} className={inputCls} placeholder="Dark, grounded, hopeful" />
          </Field>
          <Field label="Setting">
            <input value={form.setting} onChange={(e) => setForm({ ...form, setting: e.target.value })} className={inputCls} placeholder="A ruined empire, 2087" />
          </Field>
        </div>
        <Field label="Central conflict">
          <input value={form.conflict} onChange={(e) => setForm({ ...form, conflict: e.target.value })} className={inputCls} placeholder="Loyalty vs. conscience" />
        </Field>
        <Field label="Desired ending (optional)">
          <input value={form.endingGoal} onChange={(e) => setForm({ ...form, endingGoal: e.target.value })} className={inputCls} placeholder="The protagonist wakes changed" />
        </Field>
        <Field label="Themes (comma-separated)">
          <input value={form.themes} onChange={(e) => setForm({ ...form, themes: e.target.value })} className={inputCls} placeholder="exile, loyalty, love" />
        </Field>
        <div className="grid md:grid-cols-2 gap-5">
          <Field label="Target chapters">
            <input type="number" min={1} max={100} value={form.targetChapters} onChange={(e) => setForm({ ...form, targetChapters: parseInt(e.target.value) || 8 })} className={inputCls} />
          </Field>
          <Field label="Language">
            <input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} className={inputCls} placeholder="en" />
          </Field>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button disabled={loading} type="submit" className="w-full rounded-lg bg-accent py-4 font-bold text-canvas hover:bg-accent-dim disabled:opacity-50">
          {loading ? "Creating…" : "Create story"}
        </button>
      </form>
    </main>
  );
}

const inputCls = "w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs uppercase tracking-wide text-muted mb-1">{label}</span>{children}</label>;
}
