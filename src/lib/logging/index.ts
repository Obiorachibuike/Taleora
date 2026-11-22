/**
 * Structured logging. Writes single-line JSON to stdout/stderr.
 * Secrets and manuscript content must NEVER be logged (see redact()).
 */

export type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: Level = (process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === "production" ? "info" : "debug");

const SENSITIVE_KEYS = new Set([
  "password", "passwordhash", "token", "tokenhash", "apikey", "api_key", "authorization",
  "secret", "private_key", "privatekey", "cookie", "set-cookie", "session",
  "authorization: ", "emailverificationtoken", "resettoken",
]);

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const normalized = k.toLowerCase();
    if (SENSITIVE_KEYS.has(normalized) || normalized.includes("key") || normalized.includes("secret") || normalized.includes("token") || normalized.includes("hash")) {
      out[k] = "[redacted]";
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

function write(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const line = {
    level,
    msg,
    time: new Date().toISOString(),
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const out = JSON.stringify(line);
  if (level === "error" || level === "warn") process.stderr.write(out + "\n");
  else process.stdout.write(out + "\n");
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => write("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write("error", msg, meta),
};

export function requestId(): string {
  const c = globalThis.crypto;
  return c.randomUUID();
}
