import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, sessions, creditAccounts, creditTransactions, plans, subscriptions } from "@/lib/db/schema";
import type { User } from "@/lib/db/schema";
import { hashPassword, verifyPassword, validatePasswordStrength } from "./password";
import { createSession } from "./session";
import { rateLimit } from "@/lib/security/rate-limit";
import { sendVerificationEmail } from "./verification";
import { log } from "@/lib/logging";
import { HttpError } from "@/lib/api/handler";

export class AuthError extends HttpError {
  constructor(message: string, code: string, status = 400) {
    super(status, code, message);
    this.name = "AuthError";
  }
}

const FREE_PLAN_CODE = "free";

/** Register a new user; sends verification email; creates free account. Returns user + session token. */
export async function registerUser(input: {
  email: string;
  name: string;
  password: string;
  meta?: { ipAddress?: string | null; userAgent?: string | null };
}): Promise<{ user: User; sessionToken: string }> {
  if (!input.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    throw new AuthError("A valid email is required", "email_invalid");
  }
  const strength = validatePasswordStrength(input.password);
  if (!strength.ok) throw new AuthError(strength.message ?? "Weak password", "password_weak");

  const limit = rateLimit(`register:${input.email.toLowerCase()}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) throw new AuthError("Too many registration attempts — please try again later", "rate_limited", 429);

  const db = await getDb();
  const existing = await db.select({ id: users.id }).from(users).where(and(eq(users.email, input.email.toLowerCase()), isNull(users.deletedAt))).limit(1);
  if (existing.length > 0) throw new AuthError("An account with this email already exists", "email_exists", 409);

  const passwordHash = await hashPassword(input.password);
  const [user] = await db.insert(users).values({
    id: crypto.randomUUID(),
    email: input.email.toLowerCase(),
    name: input.name.trim().slice(0, 120),
    passwordHash,
    role: "USER",
    status: "ACTIVE",
  }).returning();

  // Default plan: free tier (idempotent)
  const planRows = await db.select().from(plans).where(eq(plans.code, FREE_PLAN_CODE)).limit(1);
  const plan = planRows[0];
  if (plan) {
    await db.insert(creditAccounts).values({
      id: crypto.randomUUID(),
      userId: user.id,
      balance: plan.generationCredits,
    });
    await db.insert(subscriptions).values({
      id: crypto.randomUUID(),
      userId: user.id,
      planId: plan.id,
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
      provider: "manual",
    });
  } else {
    log.warn("No free plan found; user created without plan", { userId: user.id });
  }

  await sendVerificationEmail(user.email, user.name, "verify").catch((err) => {
    log.warn("Verification email failed", { err: String(err) });
  });

  const { token } = await createSession(user.id, { userAgent: input.meta?.userAgent ?? null, ipAddress: input.meta?.ipAddress ?? null });
  return { user, sessionToken: token };
}

export async function loginUser(input: {
  email: string;
  password: string;
  meta?: { ipAddress?: string | null; userAgent?: string | null };
}): Promise<{ user: User; sessionToken: string } & { rememberMe?: boolean }> {
  const email = input.email.toLowerCase().trim();
  const limit = rateLimit(`login:${email}`, 10, 10 * 60 * 1000);
  if (!limit.allowed) throw new AuthError("Too many login attempts — please try again later", "rate_limited", 429);

  const db = await getDb();
  const rows = await db.select().from(users).where(and(eq(users.email, email), isNull(users.deletedAt))).limit(1);
  const user = rows[0];
  if (!user || !user.passwordHash) throw new AuthError("Invalid email or password", "invalid_credentials", 401);
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw new AuthError("Invalid email or password", "invalid_credentials", 401);
  if (user.status === "SUSPENDED") throw new AuthError("Your account is suspended. Please contact support.", "account_suspended", 403);
  if (user.status === "DELETED") throw new AuthError("Account not found", "account_deleted", 401);

  const { token } = await createSession(user.id, { userAgent: input.meta?.userAgent ?? null, ipAddress: input.meta?.ipAddress ?? null });
  return { user, sessionToken: token };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const strength = validatePasswordStrength(newPassword);
  if (!strength.ok) throw new AuthError(strength.message ?? "Weak password", "password_weak");
  const db = await getDb();
  const rows = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user?.passwordHash) throw new AuthError("Password change unavailable for this account", "password_unavailable", 400);
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw new AuthError("Current password is incorrect", "current_password_wrong");
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, userId));
  // invalidate other sessions
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function deleteAccount(userId: string, password: string) {
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) throw new AuthError("Account not found", "account_not_found", 404);
  if (user.passwordHash) {
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new AuthError("Password is incorrect", "password_wrong");
  }
  const now = new Date();
  await db.update(users).set({ status: "DELETED", deletedAt: now, passwordHash: null }).where(eq(users.id, userId));
  await db.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function grantFreePlan(userId: string) {
  const db = await getDb();
  const planRows = await db.select().from(plans).where(eq(plans.code, FREE_PLAN_CODE)).limit(1);
  const plan = planRows[0];
  if (!plan) throw new AuthError("Free plan missing", "plan_missing", 500);
  const existing = await db.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1);
  if (existing.length === 0) {
    await db.insert(creditAccounts).values({ id: crypto.randomUUID(), userId, balance: plan.generationCredits });
  }
  const subs = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active"))).limit(1);
  if (subs.length === 0) {
    await db.insert(subscriptions).values({
      id: crypto.randomUUID(),
      userId,
      planId: plan.id,
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
      provider: "manual",
    });
  }
}
