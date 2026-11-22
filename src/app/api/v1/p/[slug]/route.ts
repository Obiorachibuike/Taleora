import { withAuth, apiOk, HttpError } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { publicStories, stories, chapters, projects } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public read of a published story — no auth required. Returns excerpt only. */
export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const pubRows = await db.select().from(publicStories).where(and(eq(publicStories.slug, ctx.params.slug))).limit(1);
  const pub = pubRows[0];
  if (!pub) throw new HttpError(404, "not_found", "Story not found");
  const storyRows = await db.select().from(stories).where(eq(stories.id, pub.storyId)).limit(1);
  const story = storyRows[0];
  if (!story || story.deletedAt) throw new HttpError(404, "not_found", "Story not found");
  const chapterRows = await db.select().from(chapters).where(and(eq(chapters.projectId, story.projectId), isNull(chapters.deletedAt))).orderBy(chapters.index).limit(30);
  const chaptersOut = (chapterRows as any[]).map((c) => ({
    index: c.index,
    title: c.title,
    // excerpt only — do not expose the whole manuscript publicly
    excerpt: c.content.slice(0, 1200),
  }));
  return apiOk({ publicStory: pub, story: { id: story.id, title: pub.title, status: story.status, wordCount: story.wordCount }, chapters: chaptersOut }, ctx.requestId);
}, { allowAnonymous: true });
