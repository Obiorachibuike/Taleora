import { withAuth, parseBody, jsonWithSession } from "@/lib/api/handler";
import { loginSchema } from "@/lib/validation/schemas";
import { loginUser } from "@/lib/auth/service";
import { clientIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, loginSchema);
  const { user, sessionToken } = await loginUser({
    email: body.email,
    password: body.password,
    meta: { ipAddress: clientIp(req), userAgent: req.headers.get("user-agent") },
  });
  return jsonWithSession({ user: sanitize(user) }, ctx.requestId, sessionToken);
}, { allowAnonymous: true });

function sanitize(u: any) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, emailVerifiedAt: u.emailVerifiedAt };
}
