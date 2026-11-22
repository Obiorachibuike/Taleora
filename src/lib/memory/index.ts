import { getDb } from "@/lib/db";
import {
  projects, stories, storyMemories, storyFacts, storyEvents, storyTimelines, storySummaries, storyOutlines,
  chapters, characters, memoryVersions,
} from "@/lib/db/schema";
import { and, eq, isNull, desc, sql } from "drizzle-orm";

/**
 * Story memory engine.
 *
 * - extractFromChapter: heuristic + optional AI extraction of facts/events from a chapter
 * - retrieveContext: relevant memory for the next chapter (relevance + context limits)
 * - checkContinuity: compare new facts against existing canon and flag conflicts
 */

export interface ExtractedMemory {
  facts: Array<{ category: string; fact: string; confidence: number }>;
  events: Array<{ summary: string; timelineLabel?: string; participants?: string[] }>;
  timeline: Array<{ label: string; summary?: string; chapterIndex?: number }>;
  summaries?: Array<{ chapterIndex: number; summary: string; themes?: string[] }>;
}

/** Heuristic extraction — never fabricates; purely sentence-level signals. */
export function heuristicExtract(content: string, chapterIndex: number): ExtractedMemory {
  const sentences = content.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 20);
  const facts: ExtractedMemory["facts"] = [];
  const events: ExtractedMemory["events"] = [];

  // Numbers, years, capitalized names as signal
  for (const s of sentences) {
    const years = s.match(/\b(?:19|20)\d{2}\b/g);
    const names = s.match(/\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g) ?? [];
    const uniqueNames = [...new Set(names.filter((n) => n.length >= 3 && !/^(The|A|An|In|On|At|But|And)$/i.test(n)))].slice(0, 4);
    if (years || uniqueNames.length) {
      facts.push({
        category: years?.length ? "timeline" : "character",
        fact: s.slice(0, 300),
        confidence: 0.5,
      });
    }
    // Event-ish sentence: contains an action verb pattern
    if (/(decided|left|arrived|found|discovered|killed|died|escaped|decided|promised|asked|said|met|built|changed|broke)/i.test(s) && s.length > 30 && s.length < 400) {
      events.push({ summary: s.slice(0, 240), timelineLabel: years?.[0] ?? undefined, participants: uniqueNames.slice(0, 3) });
    }
  }
  // Cap extraction volume
  return { facts: facts.slice(0, 20), events: events.slice(0, 10), timeline: uniqueTimeline(sentences).slice(0, 10) };
}

function uniqueTimeline(sentences: string[]): ExtractedMemory["timeline"] {
  const labels = new Set<string>();
  const out: ExtractedMemory["timeline"] = [];
  for (const s of sentences) {
    const years = s.match(/\b(?:19|20)\d{2}\b/);
    const mall = ["The morning", "That night", "Later that day", "The next morning", "Afterward", "Earlier"];
    const timeRef = years?.[0] ?? mall.find((m) => s.toLowerCase().startsWith(m.toLowerCase()));
    if (timeRef && !labels.has(timeRef)) {
      labels.add(timeRef);
      out.push({ label: timeRef, summary: s.slice(0, 200) });
    }
  }
  return out;
}

/** Persist extraction results into the memory tables. Returns counts. */
export async function persistExtraction(projectId: string, chapterIndex: number, extraction: ExtractedMemory, changedBy: string) {
  const db = await getDb();
  let factsCount = 0, eventsCount = 0, timelinesCount = 0;

  // facts
  for (const f of extraction.facts) {
    await db.insert(storyFacts).values({
      id: crypto.randomUUID(),
      projectId,
      category: f.category,
      fact: f.fact,
      confidence: f.confidence,
      sourceChapterIndex: chapterIndex,
      isCanonical: true,
    });
    factsCount++;
  }

  // events
  for (const e of extraction.events) {
    const maxRow = await db.select({ m: sql<number>`coalesce(max(${storyEvents.sequence}), 0)` }).from(storyEvents).where(eq(storyEvents.projectId, projectId));
    await db.insert(storyEvents).values({
      id: crypto.randomUUID(),
      projectId,
      sequence: (maxRow[0]?.m ?? 0) + 1,
      timelineLabel: e.timelineLabel ?? null,
      summary: e.summary,
      participants: e.participants ?? [],
      sourceChapterIndex: chapterIndex,
    });
    eventsCount++;
  }

  // timeline entries
  for (const t of extraction.timeline) {
    await db.insert(storyTimelines).values({
      id: crypto.randomUUID(),
      projectId,
      label: t.label,
      chapterIndex,
      summary: t.summary ?? null,
    });
    timelinesCount++;
  }

  // memory summary memory row (chapter_summary)
  const summary = extraction.events[0]?.summary ?? extraction.facts[0]?.fact ?? "";
  if (summary) {
    await upsertStoryMemory(projectId, "chapter_summary", `chapter:${chapterIndex}`, summary, 0.7, chapterIndex, changedBy);
  }

  // snapshot memory version
  const maxV = await db.select({ v: sql<number>`coalesce(max(${memoryVersions.version}), 0)` }).from(memoryVersions).where(eq(memoryVersions.projectId, projectId));
  const snapshot = await buildMemorySnapshot(projectId);
  await db.insert(memoryVersions).values({
    id: crypto.randomUUID(),
    projectId,
    snapshotKind: "chapter_memory",
    version: (maxV[0]?.v ?? 0) + 1,
    snapshot: snapshot as any,
    changedBy,
  });

  return { factsCount, eventsCount, timelinesCount };
}

async function upsertStoryMemory(projectId: string, kind: string, subject: string, content: string, confidence: number, sourceChapterIndex: number | null, changedBy: string) {
  const db = await getDb();
  await db.insert(storyMemories).values({
    id: crypto.randomUUID(),
    projectId,
    kind,
    subject,
    content,
    confidence,
    sourceChapterIndex,
    canonical: false,
  });
}

async function buildMemorySnapshot(projectId: string): Promise<Record<string, unknown>> {
  const db = await getDb();
  const facts = await db.select().from(storyFacts).where(and(eq(storyFacts.projectId, projectId), isNull(storyFacts.deletedAt))).limit(200);
  const timelines = await db.select().from(storyTimelines).where(eq(storyTimelines.projectId, projectId)).limit(50);
  const events = await db.select().from(storyEvents).where(eq(storyEvents.projectId, projectId)).limit(50);
  return { facts, timelines, events, capturedAt: new Date().toISOString() };
}

/** Fetch chapter-relevant memory for the next chapter with context limits. */
export async function retrieveContext(projectId: string, opts: { limit?: number; maxChars?: number } = {}): Promise<string> {
  const db = await getDb();
  const limit = opts.limit ?? 12;
  const maxChars = opts.maxChars ?? 4000;

  const project = (await db.select().from(projects).where(eq(projects.id, projectId)).limit(1))[0];
  const outline = (await db.select().from(storyOutlines).where(eq(storyOutlines.projectId, projectId)).limit(1))[0];
  const allChapters = await db.select().from(chapters).where(and(eq(chapters.projectId, projectId), isNull(chapters.deletedAt))).orderBy(chapters.index);

  const parts: string[] = [];
  if (project) {
    parts.push(`PROJECT: ${project.title}`, `GENRE: ${project.genre ?? "(unset)"}`, `PREMISE: ${project.premise ?? "(unset)"}`, project.setting ? `SETTING: ${project.setting}` : "");
  }
  const approvedOutline = outline ?? null;
  if (approvedOutline) {
    parts.push(`OUTLINE: ${approvedOutline.logline ?? approvedOutline.title ?? ""}`);
    parts.push(`THEMES: ${(approvedOutline.themes ?? []).join(", ")}`);
  }
  // recent summaries (last 3 completed)
  const summaries = await db.select().from(storySummaries).where(eq(storySummaries.projectId, projectId)).orderBy(desc(storySummaries.chapterIndex)).limit(3);
  for (const s of summaries) parts.push(`SUMMARY chapter ${s.chapterIndex}: ${s.summary}`);
  // unresolved threads (memory kind thread)
  const threads = await db.select().from(storyMemories).where(and(eq(storyMemories.projectId, projectId), eq(storyMemories.kind, "thread"), isNull(storyMemories.deletedAt))).limit(6);
  for (const t of threads) parts.push(`THREAD: ${t.content}`);
  // characters (top 6)
  const chars = await db.select().from(characters).where(and(eq(characters.projectId, projectId), isNull(characters.deletedAt))).limit(6);
  for (const c of chars) parts.push(`CHARACTER ${c.name}: ${[c.role, c.personality?.slice(0, 200)].filter(Boolean).join(" — ")}`);
  // timeline tail
  const timelines = await db.select().from(storyTimelines).where(eq(storyTimelines.projectId, projectId)).orderBy(desc(storyTimelines.createdAt)).limit(4);
  for (const t of timelines) parts.push(`TIMELINE: ${t.label}${t.summary ? " — " + t.summary : ""}`);
  // next chapter meta
  if (approvedOutline) {
    const nextIndex = allChapters.length;
    const meta = (approvedOutline.chaptersMeta ?? []).find((c: any) => c.index === nextIndex);
    if (meta) parts.push(`NEXT CHAPTER ${meta.index + 1}: ${meta.title} — ${meta.summary}`);
  }

  const joined = parts.filter(Boolean).join("\n");
  return joined.length > maxChars ? joined.slice(0, maxChars) + "\n…[context truncated]" : joined;
}

/** Continuity check — compare a candidate chunk against canon facts. */
export async function checkContinuity(projectId: string, content: string): Promise<Array<{ type: string; severity: "info" | "warning" | "conflict"; detail: string }>> {
  const db = await getDb();
  const flags: Array<{ type: string; severity: "info" | "warning" | "conflict"; detail: string }> = [];
  const canon = await db.select().from(storyFacts).where(and(eq(storyFacts.projectId, projectId), isNull(storyFacts.deletedAt), eq(storyFacts.isCanonical, true))).limit(100);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const contentNorm = norm(content);

  for (const c of canon) {
    const canonNorm = norm(c.fact);
    // simple overlapping check: significant tokens of canon fact appear in content → no issue
    const canonTokens = canonNorm.split(" ").filter((t: string) => t.length > 5).slice(0, 8);
    if (!canonTokens.length) continue;
    const overlap = canonTokens.filter((t: string) => contentNorm.includes(t)).length;
    if (overlap === 0 && canonNorm.length > 40) {
      flags.push({ type: "possible_conflict", severity: "warning", detail: `Canon fact not referenced in new content: "${c.fact.slice(0, 120)}"` });
    }
  }
  // contradiction: same category, different facts with shared subject — flag (simple heuristic)
  const byCategory = new Map<string, typeof canon>();
  for (const c of canon) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }
  for (const [cat, list] of byCategory) {
    if (list.length > 3) {
      const texts = list.map((x: any) => norm(x.fact));
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const a = texts[i], b = texts[j];
          const shared = a.split(" ").filter((t: string) => b.includes(t)).length;
          if (shared >= 6 && a !== b) {
            flags.push({ type: "contradiction_suspected", severity: "info", detail: `Possible canon conflict in ${cat}: "${list[i].fact.slice(0, 80)}…" vs "${list[j].fact.slice(0, 80)}…"` });
          }
        }
      }
    }
  }
  return flags.slice(0, 30);
}

export async function saveChapterSummary(projectId: string, chapterIndex: number, summary: string, themes: string[] = [], continuityFlags: string[] = []) {
  const db = await getDb();
  const existing = await db.select().from(storySummaries).where(and(eq(storySummaries.projectId, projectId), eq(storySummaries.chapterIndex, chapterIndex))).limit(1);
  if (existing[0]) {
    await db.update(storySummaries).set({ summary, themes, continuityFlags, version: (existing[0].version ?? 1) + 1, updatedAt: new Date() }).where(eq(storySummaries.id, existing[0].id));
  } else {
    await db.insert(storySummaries).values({ id: crypto.randomUUID(), projectId, chapterIndex, summary, themes, continuityFlags, version: 1 });
  }
}
