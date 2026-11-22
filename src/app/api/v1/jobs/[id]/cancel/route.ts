import { withAuth, apiOk } from "@/lib/api/handler";
import { cancelJob } from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAuth(async (req, ctx) => {
  const ok = await cancelJob(ctx.params.id, ctx.user!.id);
  return apiOk({ cancelled: ok }, ctx.requestId);
});
