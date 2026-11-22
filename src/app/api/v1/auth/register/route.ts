import { NextResponse } from "next/server";
import { withAuth, parseBody, jsonWithSession } from "@/lib/api/handler";
import { registerSchema } from "@/lib/validation/schemas";
import { registerUser } from "@/lib/auth/service";
import { clientIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, registerSchema);
  const { user, sessionToken } = await registerUser({
    email: body.email,
    name: body.name,
    password: body.password,
    meta: { ipAddress: clientIp(req), userAgent: req.headers.get("user-agent") },
  });
  return jsonWithSession({ user: sanitize(user), emailVerificationSent: true }, ctx.requestId, sessionToken);
}, { allowAnonymous: true });

function sanitize(u: any) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, emailVerifiedAt: u.emailVerifiedAt };
}
