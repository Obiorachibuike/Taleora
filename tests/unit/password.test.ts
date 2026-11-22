import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, validatePasswordStrength } from "@/lib/auth/password";

describe("password hashing", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("Str0ng!Pass");
    expect(hash).not.toContain("Str0ng!Pass");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("Str0ng!Pass", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("Str0ng!Pass");
    expect(await verifyPassword("WrongPass123", hash)).toBe(false);
  });

  it("rejects weak passwords", () => {
    expect(validatePasswordStrength("short").ok).toBe(false);
    expect(validatePasswordStrength("allletters").ok).toBe(false);
    expect(validatePasswordStrength("Good12345678").ok).toBe(true);
  });
});
