/**
 * AES-256-GCM encryption for provider secrets at rest.
 * Key comes from AI_CONFIG_ENCRYPTION_KEY (hex/base64 of 32 bytes).
 * If missing, secrets are not encrypted and are stored only in memory —
 * encryption is mandatory for storing provider keys in the database.
 */
import crypto from "node:crypto";

function getKey(): Buffer | null {
  const raw = process.env.AI_CONFIG_ENCRYPTION_KEY;
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  // allow any sufficiently long passphrase — derive via HKDF
  return Buffer.from(crypto.hkdfSync("sha256", raw, "taleora-ai-config", "provider-secrets", 32) as ArrayBuffer);
}

export function encryptSecret(plaintext: string): string | null {
  const key = getKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const key = getKey();
  if (!key) return null;
  try {
    const [ivB64, tagB64, encB64] = stored.split(".");
    if (!ivB64 || !tagB64 || !encB64) return null;
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const enc = Buffer.from(encB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}
