"use client";
import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api/client";

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError("Missing verification token."); return; }
    api(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => setDone(true))
      .catch((err: any) => setError(err?.message ?? "Verification failed."));
  }, [token]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="font-display text-2xl font-bold">{done ? "Email verified" : error ? "Verification failed" : "Verifying…"}</h1>
        <p className="mt-4 text-muted">{done ? "Your email is verified. You can now log in." : error ?? "Please wait…"}</p>
        <Link href={done ? "/login" : "/dashboard"} className="mt-6 inline-block text-sm text-accent hover:underline">Continue →</Link>
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
