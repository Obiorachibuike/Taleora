import { describe, it, expect } from "vitest";
import { generateToken, hashToken, constantTimeEqual } from "@/lib/auth/tokens";

describe("tokens", () => {
  it("generates a reasonably-random URL-safe token", () => {
    const t = generateToken();
    expect(typeof t).toBe("string");
    expect(t.length).toBeGreaterThanOrEqual(48);
    expect(/^[A-Za-z0-9_-]+$/.test(t)).toBe(true);
    expect(generateToken()).not.toBe(generateToken());
  });

  it("hash is deterministic", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(t);
  });

  it("hash differs from raw token and is 64-char hex", () => {
    const t = generateToken();
    expect(hashToken(t)).not.toBe(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("constantTimeEqual returns true for equal, false for different", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("short", "longer")).toBe(false);
  });
});
