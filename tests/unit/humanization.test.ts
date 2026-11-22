import { describe, it, expect } from "vitest";
import {
  countWords, splitParagraphs, splitSentences, splitIntoChunks, buildChunks,
  analyzeText, extractImportantTokens, preservationCheck, paragraphDiff,
} from "@/lib/humanization/pipeline";

describe("humanization helpers", () => {
  it("counts words", () => {
    expect(countWords("the quick brown fox")).toBe(4);
    expect(countWords("a  b\n c")).toBe(3);
    expect(countWords("")).toBe(0);
  });

  it("splits paragraphs and sentences", () => {
    const text = "First paragraph here.\n\nSecond paragraph starts now.\nAnd continues.";
    const paras = splitParagraphs(text);
    expect(paras).toHaveLength(2);
    const sentences = splitSentences("One. Two! Three? Four.");
    expect(sentences).toHaveLength(4);
  });

  it("chunks large text on paragraph boundaries", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} with some words to help with chunking.`).join("\n\n");
    const chunks = splitIntoChunks(text, 1200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n\n")).toContain("Paragraph 0");
    expect(chunks.join("\n\n")).toContain("Paragraph 29");
  });

  it("builds chunks with stable keys", () => {
    const chunks = buildChunks("Some text here.\n\nMore text here.", 1000);
    expect(chunks.length).toBe(1);
    expect(chunks[0].stableKey).toHaveLength(16);
    expect(chunks[0].charCount).toBeGreaterThan(0);
  });

  it("analyzes text honestly", () => {
    const analysis = analyzeText("A short sentence. Another one here. And a third one too.");
    expect(analysis.wordCount).toBeGreaterThan(5);
    expect(analysis.paragraphCount).toBeGreaterThan(0);
    expect(analysis.sentenceCount).toBe(3);
  });

  it("extracts important tokens", () => {
    const tokens = extractImportantTokens("The dragon guards the treasury of the ancient mountain pass.");
    // long content words + capitalized multiword names
    expect(tokens.some((t) => t.toLowerCase().includes("dragon"))).toBe(true);
    expect(tokens.some((t) => t.toLowerCase().includes("treasury"))).toBe(true);
  });

  it("preservation check detects lost content", () => {
    const original = "Elias, a quiet cartographer, crossed the mountain pass with his companion Ana.";
    const rewritten = "Elias quietly crossed the mountain pass.";
    const report = preservationCheck(original, rewritten);
    expect(report.lostTokens).toContain("cartographer");
    expect(report.lostTokens.length).toBeGreaterThan(0);
  });

  it("preservation check passes when facts preserved", () => {
    const original = "Elias, a quiet cartographer, crossed the mountain pass with his companion Ana.";
    const rewritten = "Elias, a quiet cartographer, crossed the mountain pass with his companion Ana.";
    const report = preservationCheck(original, rewritten);
    expect(report.lostTokens.length).toBe(0);
  });

  it("paragraph diff aligns paragraphs", () => {
    const diff = paragraphDiff("First paragraph.\n\nSecond paragraph.", "First paragraph still.\n\nSecond paragraph changed.");
    expect(diff).toHaveLength(2);
    expect(diff[0].beforeText).toContain("First");
    expect(diff[0].afterText).toContain("still");
  });
});
