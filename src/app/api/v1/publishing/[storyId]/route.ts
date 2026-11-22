import { withAuth, apiOk, parseBody, requireOwnership, HttpError } from "@/lib/api/handler";
import { publishSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { stories, projects, publicStories } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(input: string): string {
  const base = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "story";
  return `${base}-${randomBytes(6).toString("hex")}`;
}

async function getStory(db: any, storyId: string) {
  const rows = await db.select().from(stories).where(eq(stories.id, storyId)).limit(1);
  return rows[0] ?? null;
}

export const GET = withAuth(async (req, ctx) => {
  const db = await getDb();
  const storyRows = await db.select().from(stories).where(eq(stories.id, ctx.params.storyId)).limit(1);
  const story = storyRows[0];
  if (!story) throw new HttpError(404, "not_found", "Story not found");
  requireOwnership(ctx.user!, story.userId);
  const pubRows = await db.select().from(publicStories).where(eq(publicStories.storyId, story.id)).limit(1);
  return apiOk({ story, publicStory: pubRows[0] ?? null }, ctx.requestId);
});

export const POST = withAuth(async (req, ctx) => {
  const storyRows = await (await getDb()).select().from(stories).where(eq(stories.id, ctx.params.storyId)).limit(1);
  const story = storyRows[0];
  if (!story) throw new HttpError(404, "not_found", "Story not found");
  requireOwnership(ctx.user!, story.userId);
  const body = await parseBody(req, publishSchema);
  const db = await getDb();
  const existing = await db.select().from(publicStories).where(eq(publicStories.storyId, story.id)).limit(1);
  if (existing[0]) {
    const [updated] = await db.update(publicStories).set({
      visibility: body.visibility,
      title: body.title ?? story.title,
      description: body.description ?? null,
      publishedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(publicStories.id, existing[0].id)).returning();
    return apiOk({ publicStory: updated }, ctx.requestId);
  }
  const projectRow = (await db.select().from(projects).where(eq(projects.id, story.projectId)).limit(1))[0];
  const [pub] = await db.insert(publicStories).values({
    id: crypto.randomUUID(),
    storyId: story.id,
    slug: slugify(story.title),
    visibility: body.visibility,
    title: body.title ?? story.title,
    description: body.description ?? null,
    coverUrl: projectRow?.coverImageUrl ?? null,
    publishedAt: new Date(),
  }).returning();
  return apiOk({ publicStory: pub }, ctx.requestId);
});

export const PATCH = withAuth(async (req, ctx) => {
  const body = await parseBody(req, publishSchema);
  const db = await getDb();
  const story = await getStory(db, ctx.params.storyId);
  if (!story) throw new HttpError(404, "not_found", "Story not found");
  requireOwnership(ctx.user!, story.userId);
  const pubRows = await db.select().from(publicStories).where(eq(publicStories.storyId, story.id)).limit(1);
  if (!pubRows[0]) throw new HttpError(404, "not_found", "Not currently published");
  const [updated] = await db.update(publicStories).set({
    visibility: body.visibility,
    title: body.title ?? pubRows[0].title,
    description: body.description ?? pubRows[0].description,
    updatedAt: new Date(),
  }).where(eq(publicStories.id, pubRows[0].id)).returning();
  return apiOk({ publicStory: updated }, ctx.requestId);
});

export const DELETE = withAuth(async (req, ctx) => {
  const db = await getDb();
  const story = await getStory(db, ctx.params.storyId);
  if (!story) throw new HttpError(404, "not_found", "Story not found");
  requireOwnership(ctx.user!, story.userId);
  await db.delete(publicStories).where(eq(publicStories.storyId, story.id));
  return apiOk({ unpublished: true }, ctx.requestId);
});
