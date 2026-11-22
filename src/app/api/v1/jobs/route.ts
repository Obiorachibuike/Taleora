import { NextResponse } from "next/server";
import { withAuth, apiOk } from "@/lib/api/handler";
import { listJobs } from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 50));
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const { jobs, total } = await listJobs(ctx.user!.id, limit, offset);
  return apiOk({ jobs, total }, ctx.requestId);
});
