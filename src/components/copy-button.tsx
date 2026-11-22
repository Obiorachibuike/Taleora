"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={copy} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:text-ink hover:bg-elevated">
      {copied ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />} {copied ? "copied" : "copy"}
    </button>
  );
}
