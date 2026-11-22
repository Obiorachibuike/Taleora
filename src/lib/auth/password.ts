import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export function validatePasswordStrength(plain: string): { ok: boolean; message?: string } {
  if (plain.length < 8) return { ok: false, message: "Password must be at least 8 characters" };
  if (plain.length > 256) return { ok: false, message: "Password is too long" };
  if (!/[A-Za-z]/.test(plain) || !/[0-9]/.test(plain)) {
    return { ok: false, message: "Password must contain both letters and numbers" };
  }
  return { ok: true };
}
