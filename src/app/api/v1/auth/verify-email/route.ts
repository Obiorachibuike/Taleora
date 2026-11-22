import { z } from "zod";
import { withAuth, parseBody, apiOk } from "@/lib/api/handler";
import { consumeToken } from "@/lib/auth/verification";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ token: z.string().min(1) });

export const POST = withAuth(async (req, ctx) => {
  const { token } = await parseBody(req, schema);
  const consumed = await consumeToken(token, "EMAIL_VERIFICATION");
  if (!consumed) return apiOk({ verified: false, message: "Invalid or expired verification token" }, ctx.requestId);
  const db = await getDb();
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, consumed.email));
  return apiOk({ verified: true }, ctx.requestId);
}, { allowAnonymous: true });
