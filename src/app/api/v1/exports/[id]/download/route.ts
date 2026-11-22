import { withAuth, requireOwnership, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { exportJobs, files } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const rows = await db.select().from(exportJobs).where(eq(exportJobs.id, ctx.params.id)).limit(1);
  const job = rows[0];
  if (!job) throw new HttpError(404, "not_found", "Export job not found");
  requireOwnership(ctx.user!, job.userId);
  if (!job.fileId) throw new HttpError(409, "not_ready", "Export is not ready");
  const fileRows = await db.select().from(files).where(eq(files.id, job.fileId)).limit(1);
  const file = fileRows[0];
  if (!file) throw new HttpError(404, "not_found", "Export file not found");
  // Local exports: file is stored under ./public/exports — stream it
  if (file.provider === "local") {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const url = file.url.replace(/^\/public\//, "");
    const abs = path.join(process.cwd(), url);
    const buffer = await fs.readFile(abs).catch(() => null);
    if (!buffer) throw new HttpError(404, "not_found", "Export file missing on disk");
    return new Response(buffer, {
      headers: { "Content-Type": file.mimeType ?? "application/octet-stream", "Content-Disposition": `attachment; filename="${file.fileName ?? "export"}"` },
    });
  }
  // Cloudinary / remote files: redirect (signed URL if provider supports)
  return Response.redirect(file.url, 302);
});
