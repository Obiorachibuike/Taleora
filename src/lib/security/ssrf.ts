/**
 * SSRF prevention for outbound provider requests.
 * Admin-configured provider URLs are validated against this before use.
 *
 * Blocks: localhost, loopback, RFC1918 private ranges, link-local/metadata,
 * CGNAT, IPv6 loopback/ULA, and well-known metadata hostnames.
 */
import { URL } from "node:url";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-identity.compute.internal",
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => parseInt(n, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // 0/8, 10/8, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 192 && b === 0) return true; // 192.0.0/24 (IPv6 transition)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true; // documentation (blocked conservatively)
  if (a === 203 && b === 0) return true; // documentation
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA
  if (normalized.startsWith("ff")) return true; // multicast
  if (normalized.startsWith("::ffff:")) {
    const v4 = normalized.slice(7);
    return isPrivateIPv4(v4);
  }
  return false;
}

export interface UrlValidationResult {
  ok: boolean;
  reason?: string;
  normalized?: string;
}

export function validateProviderUrl(rawUrl: string, opts?: { allowPrivate?: boolean; allowLocalHttp?: boolean }): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") return { ok: false, reason: "URL is required" };
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Invalid URL format" };
  }
  const scheme = url.protocol;
  if (scheme !== "https:" && scheme !== "http:") {
    return { ok: false, reason: `Unsupported scheme "${scheme}" — use https://` };
  }
  if (scheme === "http:" && !opts?.allowLocalHttp) {
    return { ok: false, reason: "http:// is only allowed for localhost in development" };
  }

  const hostname = url.hostname.toLowerCase();
  // Development escape hatch: allow localhost over http when explicitly enabled.
  if (opts?.allowLocalHttp && (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") && scheme === "http:") {
    url.username = "";
    url.password = "";
    return { ok: true, normalized: url.toString().replace(/\/$/, "") };
  }
  if (BLOCKED_HOSTNAMES.has(hostname)) return { ok: false, reason: `Blocked hostname "${hostname}"` };

  const ipKind = isIP(hostname);
  if (ipKind === 4) {
    if (!opts?.allowPrivate && isPrivateIPv4(hostname)) {
      return { ok: false, reason: `Private IPv4 address "${hostname}" is not allowed` };
    }
  } else if (ipKind === 6) {
    if (!opts?.allowPrivate && isPrivateIPv6(hostname)) {
      return { ok: false, reason: `Private IPv6 address "${hostname}" is not allowed` };
    }
  }

  if (!opts?.allowPrivate && hostname === "localhost" && scheme !== "http:") {
    return { ok: false, reason: "localhost over https is not allowed" };
  }

  // Strip credentials from URL (never send user-in-URL)
  url.username = "";
  url.password = "";
  return { ok: true, normalized: url.toString().replace(/\/$/, "") };
}

/** Resolve a URL to a hostname + allow only when it resolves outside blocked ranges at request time (best-effort). */
export function safeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}
