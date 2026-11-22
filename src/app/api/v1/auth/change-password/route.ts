import { withAuth, parseBody, apiOk } from "@/lib/api/handler";
import { changePasswordSchema } from "@/lib/validation/schemas";
import { changePassword } from "@/lib/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, changePasswordSchema);
  await changePassword(ctx.user!.id, body.currentPassword, body.newPassword);
  return apiOk({ changed: true }, ctx.requestId);
});
