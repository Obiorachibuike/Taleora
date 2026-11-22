import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret, isEncryptionEnabled } from "@/lib/security/encryption";

describe("encryption (AES-256-GCM)", () => {
  const KEY = "a".repeat(64);
  beforeEach(() => { process.env.AI_CONFIG_ENCRYPTION_KEY = KEY; });
  afterEach(() => { delete process.env.AI_CONFIG_ENCRYPTION_KEY; });

  it("encrypts and decrypts round-trip", () => {
    const ct = encryptSecret("super-secret-key-123");
    expect(ct).not.toBeNull();
    expect(ct).not.toContain("super-secret-key-123");
    expect(ct!.split(".")).toHaveLength(3);
    const pt = decryptSecret(ct);
    expect(pt).toBe("super-secret-key-123");
  });

  it("returns null (not throw) when decrypting without key", () => {
    delete process.env.AI_CONFIG_ENCRYPTION_KEY;
    expect(decryptSecret("abc.def.ghi")).toBeNull();
    expect(isEncryptionEnabled()).toBe(false);
  });

  it("returns null when decrypting garbage", () => {
    const result = decryptSecret("garbage-not-base64");
    expect(result).toBeNull();
  });

  it("detects encryption availability", () => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = KEY;
    expect(isEncryptionEnabled()).toBe(true);
  });
});
