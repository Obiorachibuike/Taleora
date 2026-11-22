"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/v1/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setDone(true);
    } catch (err: any) { setError(err?.message ?? "Failed to send reset email"); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="font-display text-2xl font-bold">Reset your password</h1>
        {done ? (
          <p className="mt-4 text-muted">If an account exists for that email, a reset link has been sent.</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 rounded-xl border border-line bg-surface p-6 space-y-4">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg bg-canvas border border-line px-4 py-3 text-ink focus:outline-none focus:border-accent" placeholder="Your email" />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" className="w-full rounded-lg bg-accent py-3 font-bold text-canvas hover:bg-accent-dim">Send reset link</button>
          </form>
        )}
        <Link href="/login" className="mt-6 inline-block text-sm text-muted hover:text-ink">Back to log in</Link>
      </div>
    </main>
  );
}
