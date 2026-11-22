"use client";
import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api/client";

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!token) setError("Missing reset token. Request a new link."); }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/v1/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      setDone(true);
      setTimeout(() => router.replace("/login"), 1800);
    } catch (err: any) { setError(err?.message ?? "Reset failed. Please request a new link."); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="font-display text-2xl font-bold">Set a new password</h1>
        {done ? (
          <p className="mt-4 text-accent">Password updated — redirecting to log in…</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 rounded-xl border border-line bg-surface p-6 space-y-4">
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent" placeholder="New password (min 8)" />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" className="w-full rounded-lg bg-accent py-3 font-bold text-canvas hover:bg-accent-dim">Update password</button>
          </form>
        )}
        <Link href="/login" className="mt-6 inline-block text-sm text-muted hover:text-ink">Back to log in</Link>
      </div>
    </main>
  );
}

export default function Wrapper() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center bg-canvas px-6"><p className="text-muted">Loading…</p></main>}>
      <Inner />
    </Suspense>
  );
}
