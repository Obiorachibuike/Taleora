import { withAuth, parseBody, apiOk } from "@/lib/api/handler";
import { resetPasswordSchema } from "@/lib/validation/schemas";
import { consumeToken } from "@/lib/auth/verification";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { HttpError } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, resetPasswordSchema);
  const strength = validatePasswordStrength(body.newPassword);
  if (!strength.ok) throw new HttpError(400, "password_weak", strength.message ?? "Weak password");
  const consumed = await consumeToken(body.token, "PASSWORD_RESET");
  if (!consumed) throw new HttpError(400, "invalid_token", "Invalid or expired reset token");
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.email, consumed.email)).limit(1);
  const user = rows[0];
  if (!user || user.deletedAt) throw new HttpError(400, "invalid_token", "Invalid or expired reset token");
  await db.update(users).set({ passwordHash: await hashPassword(body.newPassword) }).where(eq(users.id, user.id));
  return apiOk({ reset: true }, ctx.requestId);
}, { allowAnonymous: true });
