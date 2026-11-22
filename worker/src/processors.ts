/**
 * Worker processors — one function per job type.
 * Each processor MUST return something small that goes into job.result.
 * Failures throw; the worker records them and retries with backoff.
 */
import { getDb } from "@/lib/db";
import {
  projects, stories, chapters, humanizationJobs, humanizationChunks, humanizationChanges,
  humanizationVersions, exportJobs, files, generationJobs,
} from "@/lib/db/schema";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { executeHumanize, executeImage, executeText } from "@/lib/ai/router";
import { runHumanizationPipeline, buildChunks, countWords } from "@/lib/humanization/pipeline";
import { generateOutline, saveOutline, generateChapter, generateCharacterProfile, continueChapter } from "@/lib/stories";
import { heuristicExtract, persistExtraction, saveChapterSummary } from "@/lib/memory";
import { buildExport } from "@/lib/exports";
import { log } from "@/lib/logging";
import { enqueueJob, recordJobEvent, updateJobProgress } from "@/lib/jobs/service";
import crypto from "node:crypto";

export async function processOutlineGeneration(job: any): Promise<Record<string, unknown>> {
  const projectId = job.payload?.projectId;
  if (!projectId) throw new Error("job payload missing projectId");
  const { outline, configVersion } = await generateOutline(projectId);
  await saveOutline(projectId, outline, configVersion);
  return { outlineId: outline.title, chapters: outline.chaptersMeta.length };
}

export async function processChapterGeneration(job: any): Promise<Record<string, unknown>> {
  const projectId = job.payload?.projectId;
  const chapterIndex = job.payload?.chapterIndex;
  if (!projectId || chapterIndex === undefined) throw new Error("job payload missing projectId/chapterIndex");
  const { chapter, memoryCounts } = await generateChapter(projectId, chapterIndex);
  // extract memory for this chapter (already done inline) and persist a summary
  return { chapterId: chapter.id, chapterIndex, memoryCounts };
}

export async function processContinueWriting(job: any): Promise<Record<string, unknown>> {
  const chapterId = job.payload?.chapterId;
  if (!chapterId) throw new Error("job payload missing chapterId");
  const { chapter, addedText } = await continueChapter(chapterId, "worker");
  return { chapterId: chapter.id, addedWords: addedText.trim().split(/\s+/).filter(Boolean).length };
}

export async function processHumanization(job: any): Promise<Record<string, unknown>> {
  const humanizationJobId = job.payload?.humanizationJobId;
  if (!humanizationJobId) throw new Error("job payload missing humanizationJobId");

  const db = await getDb();
  const rows = await db.select().from(humanizationJobs).where(eq(humanizationJobs.id, humanizationJobId)).limit(1);
  const hj = rows[0];
  if (!hj) throw new Error("Humanization job not found");

  await db.update(humanizationJobs).set({ status: "processing", currentStage: "queued", progress: 5, updatedAt: new Date() }).where(eq(humanizationJobs.id, hj.id));
  await updateJobProgress(job.id, 5, "queued");

  const chunks = buildChunks(hj.originalText);
  await db.update(humanizationJobs).set({ chunkCount: chunks.length, currentStage: "planning" }).where(eq(humanizationJobs.id, hj.id));
  // create chunk rows
  await db.insert(humanizationChunks).values(chunks.map((c: any) => ({ id: crypto.randomUUID(), jobId: hj.id, index: c.index, stableKey: c.stableKey, text: c.text, charCount: c.charCount, status: "pending" })));

  let completed = 0;
  let context: any = {};
  if (hj.projectId) {
    try {
      const { retrieveContext } = await import("@/lib/memory");
      context.storyContext = await retrieveContext(hj.projectId, { maxChars: 4000 });
    } catch { /* no memory context available */ }
  }

  const result = await runHumanizationPipeline(
    { text: hj.originalText, mode: hj.mode, intensity: hj.intensity, context: context },
    async (text) => {
      // real rewrite call via AI router (context-aware prompt built by the adapter/pipeline)
      const { result: out } = await executeHumanize("HUMANIZATION", {
        text,
        mode: hj.mode,
        intensity: hj.intensity,
        context: { storyTitle: context.storyContext?.slice(0, 200) },
      });
      return { text: out.text, usage: out.usage };
    },
    {
      onProgress: async (p) => {
        const stage = p.stage;
        const progress = Math.max(5, Math.min(95, p.progress));
        await updateJobProgress(job.id, progress, stage);
        await db.update(humanizationJobs).set({ progress, currentStage: stage, updatedAt: new Date() }).where(eq(humanizationJobs.id, hj.id));
      },
      onChunkStatus: async (index, status) => {
        await db.update(humanizationChunks).set({ status: status === "processing" ? "processing" : status === "completed" ? "completed" : "failed", startedAt: new Date() }).where(and(eq(humanizationChunks.jobId, hj.id), eq(humanizationChunks.index, index)));
        if (status === "completed") {
          completed++;
          await db.update(humanizationJobs).set({ completedChunks: completed }).where(eq(humanizationJobs.id, hj.id));
        }
      },
    }
  );

  // write versions, changes, warnings
  const { text: rewritten } = result;
  const maxVersion = await db.select().from(humanizationVersions).where(eq(humanizationVersions.jobId, hj.id)).orderBy(desc(humanizationVersions.version)).limit(1);
  const nextVersion = (maxVersion[0]?.version ?? 0) + 1;
  await db.insert(humanizationVersions).values({ id: crypto.randomUUID(), jobId: hj.id, version: nextVersion, text: rewritten, source: "ai" });

  // per-chunk changes
  for (const ch of result.chunks) {
    const chunkRow = await db.select().from(humanizationChunks).where(and(eq(humanizationChunks.jobId, hj.id), eq(humanizationChunks.index, ch.index))).limit(1);
    const originalChunk = chunkRow[0]?.text ?? "";
    const after = rewritten.split(/\n\n/)[ch.index] ?? "";
    if (originalChunk && after && originalChunk !== after) {
      await db.insert(humanizationChanges).values({
        id: crypto.randomUUID(),
        jobId: hj.id,
        chunkIndex: ch.index,
        type: "paragraph",
        beforeText: originalChunk,
        afterText: after,
        accepted: null,
      });
    }
  }

  await db.update(humanizationJobs).set({
    status: result.warnings.length && completed === 0 ? "failed" : "completed",
    progress: 100,
    currentStage: "completed",
    analysis: result.analysis,
    plan: { chunks: result.chunks.length, warnings: result.warnings.length },
    resultText: rewritten,
    changes: result.changedParagraphs,
    warnings: result.warnings,
    wordCountBefore: result.wordCountBefore,
    wordCountAfter: result.wordCountAfter,
    completedChunks: completed,
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(humanizationJobs.id, hj.id));

  await updateJobProgress(job.id, 100, "completed");
  return { jobId: hj.id, version: nextVersion, wordCountBefore: result.wordCountBefore, wordCountAfter: result.wordCountAfter, chunks: result.chunks.length, warnings: result.warnings.length };
}

export async function processCharacterGeneration(job: any): Promise<Record<string, unknown>> {
  const projectId = job.payload?.projectId;
  if (!projectId) throw new Error("job payload missing projectId");
  const character = await generateCharacterProfile(projectId, job.payload?.name, job.payload?.hints);
  return { characterId: character.id, name: character.name };
}

export async function processMemoryExtraction(job: any): Promise<Record<string, unknown>> {
  const projectId = job.payload?.projectId;
  if (!projectId) throw new Error("job payload missing projectId");
  const db = await getDb();
  const rows = await db.select().from(chapters).where(and(eq(chapters.projectId, projectId), isNull(chapters.deletedAt))).orderBy(desc(chapters.index)).limit(1);
  const chapter = rows[0];
  if (!chapter || !chapter.content) throw new Error("No chapter with content to extract");
  const extraction = heuristicExtract(chapter.content, chapter.index);
  const counts = await persistExtraction(projectId, chapter.index, extraction, "worker");
  await saveChapterSummary(projectId, chapter.index, extraction.events[0]?.summary ?? chapter.content.slice(0, 300), [], []);
  return { chapterId: chapter.id, ...counts };
}

export async function processContinuityCheck(job: any): Promise<Record<string, unknown>> {
  const projectId = job.payload?.projectId;
  if (!projectId) throw new Error("job payload missing projectId");
  const db = await getDb();
  const rows = await db.select().from(chapters).where(and(eq(chapters.projectId, projectId), isNull(chapters.deletedAt))).orderBy(desc(chapters.index)).limit(1);
  const chapter = rows[0];
  if (!chapter || !chapter.content) throw new Error("No chapter with content to check");
  const { checkContinuity } = await import("@/lib/memory");
  const flags = await checkContinuity(projectId, chapter.content);
  return { chapterId: chapter.id, flags };
}

export async function processStoryAnalysis(job: any): Promise<Record<string, unknown>> {
  const projectId = job.payload?.projectId;
  if (!projectId) throw new Error("job payload missing projectId");
  const db = await getDb();
  const rows = await db.select().from(chapters).where(and(eq(chapters.projectId, projectId), isNull(chapters.deletedAt)));
  const content = rows.map((c: any) => c.content).join("\n");
  const { result } = await executeText("STORY_ANALYSIS", {
    system: "You are a professional developmental editor.",
    prompt: `Analyze this draft. Report: 1) plot structure, 2) character consistency, 3) tone consistency, 4) suggestions. Be honest and specific.\n\n${content.slice(0, 16000)}`,
    maxTokens: 3072,
    temperature: 0.7,
  });
  return { analysis: result.text };
}

export async function processStoryGeneration(job: any): Promise<Record<string, unknown>> {
  // STORY_GENERATION = sequential chapter generation. This worker step generates one chapter
  // then re-enqueues itself if more chapters remain.
  const projectId = job.payload?.projectId;
  if (!projectId) throw new Error("job payload missing projectId");
  const db = await getDb();
  const all = await db.select().from(chapters).where(and(eq(chapters.projectId, projectId), isNull(chapters.deletedAt)));
  const done = new Set(all.filter((c: any) => c.status === "completed").map((c: any) => c.index));
  const nextIndex = all.length;
  if (done.has(nextIndex)) {
    // complete: all chapters done for now
    return { status: "nothing_to_do" };
  }
  const { chapter } = await generateChapter(projectId, nextIndex);
  // enqueue another one if more chapters are expected
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)).limit(1))[0];
  if (project?.targetChapters && nextIndex + 1 < project.targetChapters) {
    await enqueueJob({
      userId: project.userId,
      jobType: "STORY_GENERATION",
      projectId,
      payload: { projectId, chapterIndex: nextIndex + 1 },
      dedupeKey: `story:${projectId}:${nextIndex + 1}`,
      idempotencyKey: `story:${projectId}:${nextIndex + 1}`,
    });
  }
  return { chapterId: chapter.id, chapterIndex: nextIndex };
}

export async function processExport(job: any): Promise<Record<string, unknown>> {
  const projectId = job.payload?.projectId;
  const exportJobId = job.payload?.exportJobId;
  const format = job.payload?.format ?? "txt";
  if (!projectId || !exportJobId) throw new Error("job payload missing projectId/exportJobId");

  const db = await getDb();
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)).limit(1))[0];
  if (!project) throw new Error("Project not found");
  const user = (await db.select().from(stories).where(eq(stories.projectId, projectId)).limit(1))[0];
  const rows = await db.select().from(chapters).where(and(eq(chapters.projectId, projectId), isNull(chapters.deletedAt))).orderBy(chapters.index);

  const output = await buildExport({
    title: project.title,
    author: "Taleora Reader",
    chapters: rows.map((c: any) => ({ title: c.title, content: c.content })),
    format: format as any,
  });

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), "public", "exports", projectId);
  await fs.mkdir(dir, { recursive: true });
  const fileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${format}`;
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, output.buffer);

  const relUrl = `/exports/${projectId}/${fileName}`;
  const [file] = await db.insert(files).values({
    id: crypto.randomUUID(),
    userId: project.userId,
    projectId,
    kind: "export",
    provider: "local",
    url: relUrl,
    fileName: output.fileName,
    mimeType: output.mimeType,
    sizeBytes: output.buffer.length,
    metadata: { exportJobId },
  }).returning();

  await db.update(exportJobs).set({
    status: "completed",
    progress: 100,
    fileId: file.id,
    completedAt: new Date(),
  }).where(eq(exportJobs.id, exportJobId));

  return { exportJobId, fileId: file.id, fileName: output.fileName, sizeBytes: output.buffer.length };
}

export async function processCoverGeneration(job: any): Promise<Record<string, unknown>> {
  const projectId = job.payload?.projectId;
  const prompt = job.payload?.prompt;
  if (!projectId || !prompt) throw new Error("job payload missing projectId/prompt");
  const db = await getDb();
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)).limit(1))[0];
  if (!project) throw new Error("Project not found");

  const { result, model, providerName } = await executeImage("IMAGE_GENERATION", {
    prompt,
    size: "1024x1536",
  });

  // decode or record cover URL
  let url = result.url;
  let storedPath: string | null = null;
  if (!url && result.base64) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "public", "covers", projectId);
    await fs.mkdir(dir, { recursive: true });
    const fileName = `cover-${Date.now()}.png`;
    const filePath = path.join(dir, fileName);
    await fs.writeFile(filePath, Buffer.from(result.base64, "base64"));
    storedPath = `/covers/${projectId}/${fileName}`;
    url = storedPath;
  }
  if (!url) throw new Error("Image provider did not return a usable image");

  await db.update(projects).set({ coverImageUrl: url, coverVersion: (project.coverVersion ?? 1) + 1, updatedAt: new Date() }).where(eq(projects.id, projectId));
  return { projectId, coverUrl: url, model, providerName };
}

export async function processStoryAnalysisJob(job: any) {
  return processStoryAnalysis(job);
}
