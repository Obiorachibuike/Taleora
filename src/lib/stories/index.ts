/**
 * Story generation helpers — used by the worker.
 * Builds prompts from project metadata, calls the AI router, and persists results.
 */
import { z } from "zod";
import { getDb } from "@/lib/db";
import { projects, stories, chapters, characters, storyOutlines, storyMemories } from "@/lib/db/schema";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { executeText, executeStructured, recordUsage, getConfigVersion } from "@/lib/ai/router";
import { retrieveContext, heuristicExtract, persistExtraction, saveChapterSummary, checkContinuity } from "@/lib/memory";
import { log } from "@/lib/logging";

export const outlineSchema = z.object({
  title: z.string(),
  logline: z.string(),
  synopsis: z.string(),
  themes: z.array(z.string()).default([]),
  endingGoal: z.string().optional().default(""),
  chaptersMeta: z.array(z.object({
    index: z.number().int(),
    title: z.string(),
    summary: z.string(),
    keyEvents: z.array(z.string()).optional().default([]),
  })).min(1),
  characters: z.array(z.object({ name: z.string(), role: z.string().optional().default(""), description: z.string().optional().default("") })).optional().default([]),
});

export type OutlineData = z.infer<typeof outlineSchema>;

const SYSTEM_WRITER = [
  "You are an award-winning novelist and developmental editor.",
  "You create compelling, grounded stories with consistent tone, clear structure, and vivid characters.",
  "You never fabricate facts beyond the premise. You respect user intent.",
  "Output only the requested content.",
].join(" ");

export async function buildProjectContext(projectId: string) {
  const db = await getDb();
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)).limit(1))[0];
  const story = (await db.select().from(stories).where(eq(stories.projectId, projectId)).limit(1))[0];
  const outlineRow = (await db.select().from(storyOutlines).where(eq(storyOutlines.projectId, projectId)).limit(1))[0];
  const charRows = await db.select().from(characters).where(and(eq(characters.projectId, projectId), isNull(characters.deletedAt)));
  return { project, story, outline: outlineRow, characters: charRows };
}

export async function generateOutline(projectId: string): Promise<{ outline: OutlineData; configVersion: number }> {
  const { project } = await buildProjectContext(projectId);
  if (!project) throw new Error("Project not found");

  const targetChapters = project.targetChapters ?? 8;
  const prompt = [
    `STORY PREMISE: ${project.premise ?? "(none provided)"}`,
    `GENRE: ${project.genre ?? "contemporary fiction"}${(project.subgenres ?? []).length ? ` — ${project.subgenres!.join(", ")}` : ""}`,
    `TONE: ${project.tone ?? "(unspecified)"}`,
    `SETTING: ${project.setting ?? "(unspecified)"}`,
    `CONFLICT: ${project.conflict ?? "(unspecified)"}`,
    `DESIRED ENDING: ${project.endingGoal ?? "(unspecified)"}`,
    `THEMES: ${(project.themes ?? []).join(", ") || "(unspecified)"}`,
    `TARGET CHAPTERS: ${targetChapters}`,
    `LANGUAGE: ${project.language ?? "en"}`,
    ``,
    `Design a compelling story outline as JSON with this exact shape:`,
    `{ "title": string, "logline": string, "synopsis": string, "themes": string[], "endingGoal": string,`,
    `  "chaptersMeta": [{ "index": number, "title": string, "summary": string, "keyEvents": string[] }],`,
    `  "characters": [{ "name": string, "role": string, "description": string }] }`,
    ``,
    `The outline MUST have exactly ${targetChapters} chapters. Keep each chapter summary to 1-3 sentences.`,
    `Characters: 2-4 major characters with a role (protagonist/antagonist/mentor/love interest).`,
  ].join("\n");

  const { data } = await executeStructured<OutlineData>("OUTLINE_GENERATION", {
    system: SYSTEM_WRITER,
    prompt,
    maxTokens: 4096,
    temperature: 0.8,
    schemaDescription: "Outline JSON described above",
  });

  const parsed = outlineSchema.parse(data);
  const configVersion = await getConfigVersion();
  return { outline: parsed, configVersion };
}

export async function saveOutline(projectId: string, outline: OutlineData, configVersion: number) {
  const db = await getDb();
  const story = (await db.select().from(stories).where(eq(stories.projectId, projectId)).limit(1))[0];
  const existing = (await db.select().from(storyOutlines).where(eq(storyOutlines.projectId, projectId)).limit(1))[0];
  if (existing) {
    const [updated] = await db.update(storyOutlines).set({
      title: outline.title,
      logline: outline.logline,
      synopsis: outline.synopsis,
      themes: outline.themes,
      chaptersMeta: outline.chaptersMeta,
      characters: outline.characters,
      endingGoal: outline.endingGoal,
      version: existing.version + 1,
      status: "draft",
      updatedAt: new Date(),
      rawJson: outline as any,
    }).where(eq(storyOutlines.id, existing.id)).returning();
    return { outline: updated };
  }
  const [row] = await db.insert(storyOutlines).values({
    id: crypto.randomUUID(),
    projectId,
    storyId: story?.id ?? null,
    title: outline.title,
    logline: outline.logline,
    synopsis: outline.synopsis,
    themes: outline.themes,
    chaptersMeta: outline.chaptersMeta,
    characters: outline.characters,
    endingGoal: outline.endingGoal,
    version: 1,
    status: "draft",
    rawJson: outline as any,
  }).returning();
  // sync project title/logline
  await db.update(projects).set({ status: "outline_review", updatedAt: new Date() }).where(eq(projects.id, projectId));
  return { outline: row };
}

export async function generateChapter(projectId: string, chapterIndex: number): Promise<{ chapter: any; memoryCounts: { factsCount: number; eventsCount: number; timelinesCount: number } }> {
  const { project, outline, characters: charRows } = await buildProjectContext(projectId);
  if (!project) throw new Error("Project not found");
  const db = await getDb();
  const context = await retrieveContext(projectId, { maxChars: 6000 });
  const meta = (outline?.chaptersMeta ?? []).find((c: any) => c.index === chapterIndex);

  const prevRows = await db.select().from(chapters).where(and(eq(chapters.projectId, projectId), eq(chapters.index, chapterIndex - 1), isNull(chapters.deletedAt))).limit(1);
  const prev = prevRows[0];
  const targetWords = project.targetWordsPerChapter ?? 1800;

  const prompt = [
    `Write Chapter ${chapterIndex + 1} of "${project.title}".`,
    `Target: ~${targetWords} words. Do NOT include any meta-commentary, headers, or "Chapter N" headings inside the text.`,
    ``,
    `STORY SO FAR:`,
    context,
    ``,
    meta ? `THIS CHAPTER: ${meta.title} — ${meta.summary}` : `This is chapter ${chapterIndex + 1}.`,
    meta?.keyEvents?.length ? `Key beats: ${meta.keyEvents.join(" / ")}` : "",
    prev ? `The previous chapter ends with:\n"${prev.content.slice(-1200)}"` : "Start the story — establish the scene and character.",
    ``,
    `Write in ${project.pov ?? "third-limited"} point of view, tone ${project.tone ?? "engaging"}, ${project.language ?? "en"}.`,
    `Consistent world-building: keep all established facts, character names and relationships consistent.`,
  ].filter(Boolean).join("\n");

  const { result, model, providerName } = await executeText("CHAPTER_GENERATION", {
    system: SYSTEM_WRITER,
    prompt,
    maxTokens: Math.min(8192, Math.ceil(targetWords * 1.5)),
    temperature: 0.85,
  });
  const content = result.text.trim();
  if (!content || content.length < 200) {
    throw new Error("Model returned too little content — aborting chapter generation (not saving empty text)");
  }

  const storyRow = (await db.select().from(stories).where(eq(stories.projectId, projectId)).limit(1))[0];
  const existing = await db.select().from(chapters).where(and(eq(chapters.projectId, projectId), eq(chapters.index, chapterIndex), isNull(chapters.deletedAt))).limit(1);
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  let chapter;
  if (existing[0]) {
    [chapter] = await db.update(chapters).set({
      title: meta?.title ?? `Chapter ${chapterIndex + 1}`,
      content,
      wordCount,
      status: "completed",
      version: (existing[0].version ?? 1) + 1,
      updatedAt: new Date(),
    }).where(eq(chapters.id, existing[0].id)).returning();
  } else {
    [chapter] = await db.insert(chapters).values({
      id: crypto.randomUUID(),
      projectId,
      storyId: storyRow?.id ?? null,
      index: chapterIndex,
      title: meta?.title ?? `Chapter ${chapterIndex + 1}`,
      content,
      wordCount,
      status: "completed",
      version: 1,
    }).returning();
  }

  // memory extraction (heuristic, inline)
  const extraction = heuristicExtract(content, chapterIndex);
  const counts = await persistExtraction(projectId, chapterIndex, extraction, project.userId);
  await saveChapterSummary(projectId, chapterIndex, extraction.events[0]?.summary ?? content.slice(0, 300), extraction.facts[0] ? [extraction.facts[0].category] : [], []);

  return { chapter, memoryCounts: counts };
}

export async function generateCharacterProfile(projectId: string, nameHint?: string, hints?: string): Promise<any> {
  const { project, characters: charRows } = await buildProjectContext(projectId);
  if (!project) throw new Error("Project not found");
  const prompt = [
    `Generate a character profile as JSON for the story "${project.title}".`,
    `Premise: ${project.premise ?? "(unknown)"}`,
    `Genre: ${project.genre ?? "contemporary fiction"}`,
    nameHint ? `Character name: ${nameHint}` : "Character name: invent one consistent with the premise",
    hints ? `Hints: ${hints}` : "",
    charRows.length ? `Existing characters: ${charRows.map((c: any) => c.name).join(", ")}` : "",
    ``,
    `JSON shape: { "name": string, "age": number|null, "role": string, "appearance": string, "personality": string,`,
    `  "background": string, "motivations": string, "strengths": string[], "weaknesses": string[],`,
    `  "fears": string, "goals": string, "speechPatterns": string, "developmentNotes": string }`,
  ].filter(Boolean).join("\n");

  const { data } = await executeStructured<any>("CHARACTER_GENERATION", {
    system: SYSTEM_WRITER,
    prompt,
    maxTokens: 4096,
    temperature: 0.8,
    schemaDescription: "Character profile JSON described above",
  });

  const db = await getDb();
  const [character] = await db.insert(characters).values({
    id: crypto.randomUUID(),
    projectId,
    userId: project.userId,
    name: typeof data?.name === "string" && data.name ? data.name : (nameHint ?? "Unnamed character"),
    age: typeof data?.age === "number" ? data.age : null,
    type: "character",
    role: data?.role ?? null,
    appearance: data?.appearance ?? null,
    personality: data?.personality ?? null,
    background: data?.background ?? null,
    motivations: data?.motivations ?? null,
    strengths: Array.isArray(data?.strengths) ? data.strengths.slice(0, 10) : [],
    weaknesses: Array.isArray(data?.weaknesses) ? data.weaknesses.slice(0, 10) : [],
    fears: data?.fears ?? null,
    goals: data?.goals ?? null,
    speechPatterns: data?.speechPatterns ?? null,
    developmentNotes: data?.developmentNotes ?? null,
    version: 1,
  }).returning();
  return character;
}

export async function continueChapter(chapterId: string, providerName: string): Promise<{ chapter: any; addedText: string }> {
  const db = await getDb();
  const rows = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  const chapter = rows[0];
  if (!chapter) throw new Error("Chapter not found");
  const projectRow = (await db.select().from(projects).where(eq(projects.id, chapter.projectId)).limit(1))[0];
  const context = await retrieveContext(chapter.projectId, { maxChars: 6000 });

  const prompt = [
    `Continue the following chapter. Keep the tone and POV. Do not summarize; keep momentum.`,
    ``,
    `STORY CONTEXT:`,
    context,
    ``,
    `CURRENT CHAPTER ENDING:`,
    chapter.content.slice(-3000),
    ``,
    `Now write the continuation of this chapter, starting from the end. Do not repeat text. Do not add meta-commentary.`,
  ].join("\n");

  const { result } = await executeText("CONTINUE_WRITING", {
    system: SYSTEM_WRITER,
    prompt,
    maxTokens: 4096,
    temperature: 0.8,
  });
  const addedText = result.text.trim();
  if (!addedText) throw new Error("Model returned no continuation");
  const newContent = `${chapter.content}\n\n${addedText}`;
  const [updated] = await db.update(chapters).set({
    content: newContent,
    wordCount: newContent.trim().split(/\s+/).filter(Boolean).length,
    version: chapter.version + 1,
    updatedAt: new Date(),
  }).where(eq(chapters.id, chapter.id)).returning();
  return { chapter: updated, addedText };
}

