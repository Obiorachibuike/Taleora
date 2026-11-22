/**
 * Simple in-memory sliding-window rate limiter.
 * Good enough for a single-node deployment; replace with Redis/ACME for
 * multi-instance production deployments. Never a silent allow.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Prevent unbounded growth
const MAX_BUCKETS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms
  limit: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    bucket = { count: 0, windowStart: now };
    if (buckets.size >= MAX_BUCKETS) {
      // evict oldest
      let oldestKey: string | null = null;
      let oldest = Infinity;
      for (const [k, b] of buckets) {
        if (b.windowStart < oldest) { oldest = b.windowStart; oldestKey = k; }
      }
      if (oldestKey) buckets.delete(oldestKey);
    }
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const resetAt = bucket.windowStart + windowMs;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt,
    limit,
  };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
