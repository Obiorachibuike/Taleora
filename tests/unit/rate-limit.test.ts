import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, resetRateLimit } from "@/lib/security/rate-limit";

describe("rate limiting", () => {
  beforeEach(() => { resetRateLimit("user-a"); resetRateLimit("user-b"); });

  it("allows up to the limit, then rejects", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("user-a", 5, 60000).allowed).toBe(true);
    }
    expect(rateLimit("user-a", 5, 60000).allowed).toBe(false);
    expect(rateLimit("user-a", 5, 60000).remaining).toBe(0);
  });

  it("tracks buckets separately", () => {
    for (let i = 0; i < 3; i++) rateLimit("user-a", 3, 60000);
    expect(rateLimit("user-a", 3, 60000).allowed).toBe(false);
    expect(rateLimit("user-b", 3, 60000).allowed).toBe(true);
  });
});
