import { withAuth, HttpError } from "@/lib/api/handler";
import { getJob, getJobEvents } from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SSE: replays events from last known seq, then streams new ones. */
export const GET = withAuth(async (req, ctx) => {
  const jobId = ctx.params.id;
  const job = await getJob(jobId, ctx.user!.id);
  if (!job) throw new HttpError(404, "not_found", "Job not found");

  const lastEventId = Number(new URL(req.url).searchParams.get("lastEventId") ?? 0);
  const encoder = new TextEncoder();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = new ReadableStream({
    async start(controller) {
      let lastSeq = lastEventId;
      // replay
      const replay = await getJobEvents(jobId, lastEventId);
      for (const ev of replay.slice(0, 200)) {
        lastSeq = Math.max(lastSeq, ev.seq);
        controller.enqueue(encoder.encode(`id: ${ev.seq}\nevent: ${ev.eventType}\ndata: ${JSON.stringify(ev.data)}\n\n`));
      }
      let attempts = 0;
      while (attempts < 240) {
        const fresh = await getJobEvents(jobId, lastSeq);
        for (const ev of fresh) {
          lastSeq = Math.max(lastSeq, ev.seq);
          controller.enqueue(encoder.encode(`id: ${ev.seq}\nevent: ${ev.eventType}\ndata: ${JSON.stringify(ev.data)}\n\n`));
        }
        const freshJob = await getJob(jobId, ctx.user!.id);
        if (!freshJob) { controller.close(); return; }
        if (["COMPLETED", "FAILED", "CANCELLED"].includes(freshJob.status)) {
          controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ status: freshJob.status })}\n\n`));
          controller.close();
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
        attempts++;
      }
      controller.close();
    },
    async cancel() { /* cleanup */ },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no" },
  });
});
