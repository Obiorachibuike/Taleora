"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api/client";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/v1/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-accent text-canvas font-bold text-2xl">T</div>
          <h1 className="mt-4 font-display text-2xl font-bold">Start writing</h1>
          <p className="text-sm text-muted mt-1">Your stories, your voice, your call</p>
        </div>
        <form onSubmit={onSubmit} className="mt-8 rounded-xl border border-line bg-surface p-6 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-1">Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent" placeholder="Your name" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-1">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-1">Password</label>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent" placeholder="At least 8 characters" />
            <p className="mt-1 text-xs text-muted">Min 8 characters, with a letter and a number.</p>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-accent py-3 font-bold text-canvas hover:bg-accent-dim disabled:opacity-50">
            {loading ? "Creating…" : "Create account"}
          </button>
          <p className="text-center text-xs text-muted">Already have an account? <Link href="/login" className="text-accent hover:underline">Log in</Link></p>
        </form>
      </div>
    </main>
  );
}
