import crypto from "node:crypto";

export interface Chunk {
  index: number;
  stableKey: string;
  text: string;
  charCount: number;
  retriedCount: number;
}

export interface PipelineProgress {
  stage: string;
  progress: number; // 0-100
  detail?: string;
}

export interface PipelineInput {
  text: string;
  mode: string;
  intensity: string;
  maxCharsPerChunk?: number;
  context?: Record<string, unknown>;
}

export interface PipelineResult {
  text: string;
  analysis: {
    paragraphCount: number;
    sentenceCount: number;
    avgSentenceLength: number;
    repeatedPhraseRate: number;
    estimatedReadability: number; // 0-100 heuristic
    wordCount: number;
    likelyDialogue: boolean;
  };
  chunks: Array<{ index: number; stableKey: string; status: "completed" | "failed"; charCount: number }>;
  changedParagraphs: Array<{ beforeText: string; afterText: string }>;
  warnings: string[];
  quality: {
    readabilityBefore: number;
    readabilityAfter: number;
    repetitionBefore: number;
    repetitionAfter: number;
    meanSentenceLengthBefore: number;
    meanSentenceLengthAfter: number;
    label: string;
  };
  wordCountBefore: number;
  wordCountAfter: number;
}

export interface RewriteFn {
  (chunkText: string, index: number): Promise<{ text: string; warnings?: string[]; usage?: { tokensIn?: number; tokensOut?: number } }>;
}

const DEFAULT_MAX_CHARS = 3500;

// ─── Text helpers (pure, testable) ──────────────────────────────────────────

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  const re = /([^.!?]+[.!?]+)|([^.!?]+$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = (m[1] ?? m[2] ?? "").trim();
    if (s) sentences.push(s);
  }
  return sentences;
}

export function splitIntoChunks(text: string, maxChars = DEFAULT_MAX_CHARS): string[] {
  const paragraphs = splitParagraphs(text);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  const flush = () => { if (current.length) { chunks.push(current.join("\n\n")); current = []; currentLen = 0; } };

  for (const p of paragraphs) {
    if (p.length > maxChars) {
      // split a very long paragraph on sentence boundaries
      flush();
      const sentences = splitSentences(p);
      let sub: string[] = [];
      let subLen = 0;
      for (const s of sentences) {
        if (subLen + s.length + 1 > maxChars && sub.length) {
          chunks.push(sub.join(" "));
          sub = [];
          subLen = 0;
        }
        sub.push(s);
        subLen += s.length + 1;
      }
      flush();
      if (sub.length) chunks.push(sub.join(" "));
      continue;
    }
    if (currentLen + p.length + 2 > maxChars && current.length) flush();
    current.push(p);
    currentLen += p.length + 2;
  }
  flush();
  if (chunks.length === 0 && text.trim()) chunks.push(text.trim());
  return chunks;
}

export function chunkStableKey(index: number, text: string): string {
  return crypto.createHash("sha256").update(`${index}|${text.slice(0, 200)}`).digest("hex").slice(0, 16);
}

export function buildChunks(text: string, maxChars = DEFAULT_MAX_CHARS): Chunk[] {
  return splitIntoChunks(text, maxChars).map((c, i) => ({
    index: i,
    stableKey: chunkStableKey(i, c),
    text: c,
    charCount: c.length,
    retriedCount: 0,
  }));
}

// ─── Analysis (heuristic, clearly labeled) ──────────────────────────────────

export function analyzeText(text: string) {
  const paragraphs = splitParagraphs(text);
  const sentences = paragraphs.flatMap(splitSentences);
  const words = countWords(text);
  const avgSentenceLength = sentences.length ? words / sentences.length : 0;
  const repeated = repeatedBigrams(text);
  const readability = estimateReadability(text);
  return {
    paragraphCount: paragraphs.length,
    sentenceCount: sentences.length,
    avgSentenceLength: Math.round(avgSentenceLength * 100) / 100,
    repeatedPhraseRate: repeated.rate,
    estimatedReadability: readability,
    wordCount: words,
    likelyDialogue: /["“”'’]/.test(text) && /^[A-Za-z][\w\s]{1,40}:/m.test(text),
  };
}

function repeatedBigrams(text: string): { rate: number } {
  const words = text.toLowerCase().match(/[a-z'’-]+/g) ?? [];
  if (words.length < 4) return { rate: 0 };
  const counts = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const key = `${words[i]} ${words[i + 1]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let repeats = 0;
  let total = 0;
  for (const c of counts.values()) { total++; if (c > 2) repeats += c - 1; }
  const rate = Math.min(1, repeats / Math.max(1, words.length - 1));
  return { rate: Math.round(rate * 1000) / 1000 };
}

/** Very rough Flesch-Kincaid-style heuristic — NOT a publishable readability score. */
export function estimateReadability(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 10) return 100;
  const sentences = splitSentences(text).length || 1;
  const syllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length);
  return Math.max(0, Math.round(Math.min(100, score)));
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

// ─── Preservation checks ────────────────────────────────────────────────────

export interface PreservationReport {
  lostTokens: string[];
  keptCount: number;
  totalCount: number;
}

/** Extract "important" tokens: proper nouns (capitalized multiword), numbers, years,
 *  quoted phrases, and rare/long content words (so character and place names that are
 *  lowercase in the source — e.g. "cartographer" — are still protected from rewriting). */
const STOPWORDS = new Set([
  "the", "and", "but", "or", "a", "an", "of", "to", "in", "on", "at", "by", "for", "with", "as",
  "this", "that", "these", "those", "was", "were", "is", "are", "be", "been", "being", "has", "have",
  "had", "will", "would", "could", "should", "can", "may", "might", "must", "do", "did", "does",
  "i", "you", "he", "she", "it", "we", "they", "him", "her", "his", "their", "my", "your", "our", "its",
  "his", "her", "his", "its", "and", "but", "not", "no", "so", "if", "then", "than", "there",
  "here", "where", "when", "what", "who", "how", "why", "all", "some", "any", "both", "each",
  "other", "such", "only", "own", "same", "very", "just", "also", "well", "now", "then", "too",
  "down", "again", "further", "once", "because", "about", "above", "after", "before", "between",
]);

export function extractImportantTokens(text: string): string[] {
  const tokens = new Set<string>();
  // numbers with units
  for (const m of text.matchAll(/\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?%?\b/g)) tokens.add(m[0]);
  for (const m of text.matchAll(/\b\d{4}\b/g)) tokens.add(m[0]); // years
  // capitalized names (1-3 words)
  for (const m of text.matchAll(/\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g)) {
    const v = m[0].trim();
    if (v.length >= 3) tokens.add(v);
  }
  // quoted phrases
  for (const m of text.matchAll(/"([^"]{6,80})"/g)) tokens.add(`"${m[1]}"`);
  // long content words (rare/specific nouns & adjectives) — length >= 7, not a stopword
  for (const m of text.matchAll(/\b([a-z][a-z'’-]{5,})\b/g)) {
    const v = m[1].toLowerCase();
    if (!STOPWORDS.has(v)) tokens.add(v);
  }
  return [...tokens].slice(0, 200);
}

/** Check that the rewritten text preserves key tokens from the original. */
export function preservationCheck(original: string, rewritten: string): PreservationReport {
  const tokens = extractImportantTokens(original);
  const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'");
  const rewrittenN = norm(rewritten);
  const lost: string[] = [];
  let kept = 0;
  for (const t of tokens) {
    if (norm(t).length > 2 && rewrittenN.includes(norm(t))) kept++;
    else lost.push(t);
  }
  return { lostTokens: lost, keptCount: kept, totalCount: tokens.length };
}

// ─── Diff (paragraph-level) ────────────────────────────────────────────────

export function paragraphDiff(original: string, rewritten: string): Array<{ beforeText: string; afterText: string }> {
  const a = splitParagraphs(original);
  const b = splitParagraphs(rewritten);
  const changes: Array<{ beforeText: string; afterText: string }> = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const before = a[i] ?? "";
    const after = b[i] ?? "";
    if (before !== after) changes.push({ beforeText: before, afterText: after });
  }
  return changes;
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

export async function runHumanizationPipeline(
  input: PipelineInput,
  rewrite: RewriteFn,
  opts: { onProgress?: (p: PipelineProgress) => void; onChunkStatus?: (index: number, status: "processing" | "completed" | "failed") => void } = {}
): Promise<PipelineResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const onChunkStatus = opts.onChunkStatus ?? (() => {});
  const warnings: string[] = [];

  // Stage 1: Input analysis
  onProgress({ stage: "analysis", progress: 5, detail: "Analyzing text structure" });
  const analysis = analyzeText(input.text);

  // Stage 2: chunking
  onProgress({ stage: "chunking", progress: 12, detail: "Splitting into semantic chunks" });
  const chunks = buildChunks(input.text, input.maxCharsPerChunk);

  // Stage 3: planning (structured plan)
  onProgress({ stage: "planning", progress: 18, detail: "Creating rewriting plan" });
  const plan = {
    mode: input.mode,
    intensity: input.intensity,
    chunkCount: chunks.length,
    preserve: ["character_names", "place_names", "relationships", "events", "timeline", "numbers", "negation", "key_facts", "narrative_perspective"],
    focus: analysis.repeatedPhraseRate > 0.15 ? ["repetition", "sentence_variety"] : ["clarity", "flow"],
    estimate: "balanced" as const,
  };

  // Stage 4: context-aware rewrite (per chunk, preserving order)
  let rewritten = "";
  const chunkStatuses: PipelineResult["chunks"] = [];
  const total = chunks.length;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    onProgress({ stage: "rewriting", progress: 20 + Math.round(((i + 0.5) / total) * 55), detail: `Rewriting chunk ${i + 1}/${total}` });
    onChunkStatus(i, "processing");
    try {
      const out = await rewrite(chunk.text, i);
      const rewrittenChunk = out.text?.trim();
      if (!rewrittenChunk) throw new Error("Empty rewrite");
      // Stage 5: preservation checks per chunk
      const preservation = preservationCheck(chunk.text, rewrittenChunk);
      if (preservation.lostTokens.length > 0) {
        warnings.push(`Chunk ${i + 1}: ${preservation.lostTokens.length} important token(s) missing in rewrite (${preservation.lostTokens.slice(0, 5).join(", ")}). Kept original for safety.`);
        // Safety: keep original text if many tokens are lost (meaning shift)
        if (preservation.lostTokens.length >= Math.max(2, preservation.totalCount * 0.4)) {
          rewritten += (rewritten ? "\n\n" : "") + chunk.text;
          onChunkStatus(i, "failed");
          chunkStatuses.push({ index: i, stableKey: chunk.stableKey, status: "failed", charCount: chunk.charCount });
          continue;
        }
      }
      rewritten += (rewritten ? "\n\n" : "") + rewrittenChunk;
      onChunkStatus(i, "completed");
      chunkStatuses.push({ index: i, stableKey: chunk.stableKey, status: "completed", charCount: rewrittenChunk.length });
    } catch (err: any) {
      warnings.push(`Chunk ${i + 1}: rewrite failed (${String(err).slice(0, 200)}). Kept original.`);
      rewritten += (rewritten ? "\n\n" : "") + chunk.text;
      onChunkStatus(i, "failed");
      chunkStatuses.push({ index: i, stableKey: chunk.stableKey, status: "failed", charCount: chunk.charCount });
    }
  }

  // Stage 6: quality evaluation (heuristic, clearly labeled)
  onProgress({ stage: "evaluating", progress: 82, detail: "Evaluating quality" });
  const after = analyzeText(rewritten);
  const changes = paragraphDiff(input.text, rewritten);
  const quality = {
    readabilityBefore: analysis.estimatedReadability,
    readabilityAfter: after.estimatedReadability,
    repetitionBefore: analysis.repeatedPhraseRate,
    repetitionAfter: after.repeatedPhraseRate,
    meanSentenceLengthBefore: analysis.avgSentenceLength,
    meanSentenceLengthAfter: after.avgSentenceLength,
    label: "heuristic (not an objective score)",
  };

  onProgress({ stage: "finalizing", progress: 95, detail: "Assembling result" });

  return {
    text: rewritten,
    analysis,
    chunks: chunkStatuses,
    changedParagraphs: changes,
    warnings,
    quality,
    wordCountBefore: analysis.wordCount,
    wordCountAfter: after.wordCount,
  };
}
