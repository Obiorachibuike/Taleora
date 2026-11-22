import { withAuth, parseBody, apiOk } from "@/lib/api/handler";
import { forgotPasswordSchema } from "@/lib/validation/schemas";
import { eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendPasswordResetEmail } from "@/lib/auth/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, forgotPasswordSchema);
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.email, body.email.toLowerCase())).limit(1);
  // Always respond the same way — do not reveal whether the email exists
  if (rows[0] && !rows[0].deletedAt) {
    await sendPasswordResetEmail(rows[0].email, rows[0].name).catch(() => {});
  }
  return apiOk({ message: "If an account exists for this email, a reset link has been sent." }, ctx.requestId);
}, { allowAnonymous: true });
