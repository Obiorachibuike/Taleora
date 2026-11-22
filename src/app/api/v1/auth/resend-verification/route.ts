import { z } from "zod";
import { withAuth, parseBody, apiOk } from "@/lib/api/handler";
import { sendVerificationEmailForUser } from "@/lib/auth/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  await parseBody(req, z.object({}));
  await sendVerificationEmailForUser(ctx.user!.id);
  return apiOk({ queued: true }, ctx.requestId);
});
