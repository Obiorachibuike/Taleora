import { withAuth, apiOk, requireOwnership, HttpError } from "@/lib/api/handler";
import { getJob } from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const job = await getJob(ctx.params.id, ctx.user!.id);
  if (!job) throw new HttpError(404, "not_found", "Job not found");
  return apiOk({ job }, ctx.requestId);
});
