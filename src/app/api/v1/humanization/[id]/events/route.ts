import { withAuth, HttpError, requireOwnership } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { humanizationJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SSE stream of humanization job progress events (polls DB). */
export const GET = withAuth(async (req, ctx) => {
  const jobId = ctx.params.id;
  const db = await getDb();
  const rows = await db.select().from(humanizationJobs).where(eq(humanizationJobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job) throw new HttpError(404, "not_found", "Humanization job not found");
  requireOwnership(ctx.user!, job.userId);

  const lastEventId = Number(new URL(req.url).searchParams.get("lastEventId") ?? 0);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastSeq = lastEventId;
      const send = () => controller.enqueue(encoder.encode(`event: progress\ndata: ${JSON.stringify({ progress: job.progress, status: job.status, stage: job.currentStage })}\n\n`));

      let attempts = 0;
      while (attempts < 120) {
        const fresh = await (await getDb()).select().from(humanizationJobs).where(eq(humanizationJobs.id, jobId)).limit(1).then((r: any[]) => r[0]);
        if (!fresh) { controller.enqueue(encoder.encode("event: error\ndata: {}\n\n")); controller.close(); return; }
        controller.enqueue(encoder.encode(`event: progress\nid: ${fresh.completedChunks}\ndata: ${JSON.stringify({ progress: fresh.progress, status: fresh.status, stage: fresh.currentStage, completedChunks: fresh.completedChunks, chunkCount: fresh.chunkCount })}\n\n`));
        if (["completed", "failed", "cancelled"].includes(fresh.status)) {
          controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ status: fresh.status })}\n\n`));
          controller.close();
          return;
        }
        lastSeq = fresh.completedChunks;
        await new Promise((r) => setTimeout(r, 1500));
        attempts++;
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no" },
  });
});
