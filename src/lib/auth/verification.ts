import { and, eq, isNull, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { verificationTokens, users } from "@/lib/db/schema";
import { generateToken, hashToken } from "./tokens";
import { sendEmail, verificationEmailTemplate, passwordResetEmailTemplate } from "./email";

export type TokenKind = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

export async function issueToken(email: string, kind: TokenKind, userId?: string, ttlHours = 24): Promise<string> {
  const db = await getDb();
  // invalidate any previous unused tokens of this kind for this email
  await db.update(verificationTokens).set({ usedAt: new Date() }).where(and(eq(verificationTokens.email, email), eq(verificationTokens.kind, kind), isNull(verificationTokens.usedAt)));
  const token = generateToken(48);
  const tokenHash = hashToken(token);
  await db.insert(verificationTokens).values({
    id: crypto.randomUUID(),
    userId: userId ?? null,
    email,
    kind,
    tokenHash,
    expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000),
  });
  return token;
}

export async function consumeToken(token: string, kind: TokenKind): Promise<{ email: string; userId: string | null } | null> {
  const db = await getDb();
  const tokenHash = hashToken(token);
  const rows = await db
    .select()
    .from(verificationTokens)
    .where(and(eq(verificationTokens.tokenHash, tokenHash), eq(verificationTokens.kind, kind), isNull(verificationTokens.usedAt), gt(verificationTokens.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await db.update(verificationTokens).set({ usedAt: new Date() }).where(eq(verificationTokens.id, row.id));
  return { email: row.email, userId: row.userId };
}

export async function sendVerificationEmail(email: string, name: string, purpose: "verify" | "reset"): Promise<void> {
  const token = await issueToken(email, purpose === "verify" ? "EMAIL_VERIFICATION" : "PASSWORD_RESET", undefined, purpose === "verify" ? 24 : 1);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";
  const url = purpose === "verify"
    ? `${appUrl}/verify-email?token=${encodeURIComponent(token)}`
    : `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const tpl = purpose === "verify" ? verificationEmailTemplate(name, url) : passwordResetEmailTemplate(name, url);
  await sendEmail({ to: email, subject: tpl.subject, text: tpl.text, html: tpl.html });
}

export async function sendVerificationEmailForUser(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) return false;
  await sendVerificationEmail(user.email, user.name, "verify");
  return true;
}

export async function sendPasswordResetEmail(email: string, name: string) {
  await sendVerificationEmail(email, name, "reset");
}

/** Attach token issued for a user (used for password-reset with a known userId). */
export async function issueResetTokenForUser(email: string, userId: string): Promise<string> {
  return issueToken(email, "PASSWORD_RESET", userId, 1);
}
