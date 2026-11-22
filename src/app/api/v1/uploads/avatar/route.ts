import { withAuth, apiOk, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/**
 * Avatar upload.
 * - http(s) URLs: stored as-is.
 * - data: URLs: validated, written to public/avatars/<userId>.<ext>, stored as /avatars/<file>.
 * - 4MB cap on data URLs.
 */
export const POST = withAuth(async (req, ctx) => {
  let body: any;
  try { body = await req.json(); } catch { throw new HttpError(400, "invalid_json", "Request body must be valid JSON"); }
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) throw new HttpError(400, "validation_failed", "url required");
  if (url.length > 5_500_000) throw new HttpError(400, "validation_failed", "avatar too large");

  const db = await getDb();

  if (url.startsWith("http://") || url.startsWith("https://")) {
    await db.update(users).set({ avatarUrl: url, updatedAt: new Date() }).where(eq(users.id, ctx.user!.id));
    return apiOk({ avatarUrl: url }, ctx.requestId);
  }

  if (url.startsWith("data:image/")) {
    const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(url);
    if (!m) throw new HttpError(400, "validation_failed", "unsupported data URL format");
    const ext = MIME_EXT[m[1]?.toLowerCase()];
    if (!ext) throw new HttpError(400, "validation_failed", "unsupported image type");
    let buf: Buffer;
    try { buf = Buffer.from(m[2], "base64"); } catch { throw new HttpError(400, "validation_failed", "invalid base64 payload"); }
    if (buf.length > 4 * 1024 * 1024) throw new HttpError(400, "validation_failed", "avatar too large (4MB max)");
    // basic magic-byte validation
    if (!magicOk(buf, ext)) throw new HttpError(400, "validation_failed", "image file does not match its declared type");
    const dir = path.join(process.cwd(), "public", "avatars");
    await fs.mkdir(dir, { recursive: true });
    const fileName = `${ctx.user!.id}.${ext}`;
    await fs.writeFile(path.join(dir, fileName), buf);
    const stored = `/avatars/${fileName}`;
    await db.update(users).set({ avatarUrl: stored, updatedAt: new Date() }).where(eq(users.id, ctx.user!.id));
    return apiOk({ avatarUrl: stored }, ctx.requestId);
  }

  throw new HttpError(400, "validation_failed", "only http(s) or image data URLs allowed");
});

function magicOk(buf: Buffer, ext: string): boolean {
  const head = buf.subarray(0, 4);
  if (ext === "png") return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  if (ext === "jpg") return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (ext === "gif") return buf.subarray(0, 3).toString("utf8") === "GIF";
  if (ext === "webp") return buf.subarray(0, 4).toString("utf8") === "RIFF" && buf.subarray(8, 12).toString("utf8") === "WEBP";
  if (ext === "svg") { const txt = buf.subarray(0, 256).toString("utf8").toLowerCase(); return txt.includes("<svg"); }
  return false;
}
