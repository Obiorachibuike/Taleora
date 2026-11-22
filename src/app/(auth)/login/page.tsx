"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect to dashboard
  useEffect(() => {
    api<{ user: { id: string } }>("/api/v1/auth/me")
      .then((res) => { if ((res as any).data?.user) router.replace("/dashboard"); })
      .catch(() => { /* not logged in */ });
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ user: any }>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      // session cookie set by server; refresh server state
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-accent text-canvas font-bold text-2xl">T</div>
          <h1 className="mt-4 font-display text-2xl font-bold">Welcome back</h1>
          <p className="text-sm text-muted mt-1">Continue writing your story</p>
        </div>
        <form onSubmit={onSubmit} className="mt-8 rounded-xl border border-line bg-surface p-6 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-1">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-1">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent" placeholder="••••••••" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-accent py-3 font-bold text-canvas hover:bg-accent-dim disabled:opacity-50">
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <div className="flex items-center justify-center gap-4 text-xs text-muted">
            <Link href="/forgot-password" className="hover:text-ink">Forgot password?</Link>
            <span>·</span>
            <Link href="/register" className="hover:text-ink">Create account</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
