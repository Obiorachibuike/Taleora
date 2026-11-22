import { withAuth, parseBody, apiOk, clearSessionCookie } from "@/lib/api/handler";
import { deleteAccountSchema } from "@/lib/validation/schemas";
import { deleteAccount } from "@/lib/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, deleteAccountSchema);
  await deleteAccount(ctx.user!.id, body.password);
  const res = apiOk({ deleted: true }, ctx.requestId);
  clearSessionCookie(res);
  return res;
});
