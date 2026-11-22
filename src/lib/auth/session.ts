import { eq, and, isNull, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import type { User } from "@/lib/db/schema";
import { generateToken, hashToken } from "./tokens";

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "taleora_session";
const SESSION_TTL_DAYS = 30;

export function sessionCookieMaxAgeSeconds() {
  return SESSION_TTL_DAYS * 24 * 60 * 60;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionCookieMaxAgeSeconds(),
  };
}

export async function createSession(
  userId: string,
  meta?: { userAgent?: string | null; ipAddress?: string | null }
): Promise<{ token: string; expiresAt: Date }> {
  const db = await getDb();
  const token = generateToken(48);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash,
    expiresAt,
    userAgent: meta?.userAgent?.slice(0, 300) ?? null,
    ipAddress: meta?.ipAddress ?? null,
    lastUsedAt: new Date(),
  });
  return { token, expiresAt };
}

export async function getSessionWithUser(token: string | null | undefined): Promise<{ session: any; user: User } | null> {
  if (!token) return null;
  const db = await getDb();
  const tokenHash = hashToken(token);
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const session = rows[0];
  if (!session) return null;
  const userRows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  const user = userRows[0];
  if (!user || user.status !== "ACTIVE" || user.deletedAt) {
    // invalidate stale session
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));
    return null;
  }
  // touch lastUsedAt (best-effort, keep async)
  db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, session.id)).catch(() => {});
  return { session, user };
}

export async function revokeSession(token: string | null | undefined) {
  if (!token) return;
  const db = await getDb();
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function revokeAllSessions(userId: string) {
  const db = await getDb();
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function listSessions(userId: string) {
  const db = await getDb();
  return db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      userAgent: sessions.userAgent,
      ipAddress: sessions.ipAddress,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .orderBy(sessions.createdAt);
}

export async function revokeSessionById(userId: string, sessionId: string) {
  const db = await getDb();
  const r = await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  return r;
}

export function sessionTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE_NAME) return rest.join("=");
  }
  return null;
}
