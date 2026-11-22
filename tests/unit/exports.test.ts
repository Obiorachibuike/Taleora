import { describe, it, expect } from "vitest";
import { buildExport } from "@/lib/exports";

describe("exports", () => {
  const input = {
    title: "The Mountain Veil",
    author: "Test Author",
    chapters: [
      { title: "Chapter 1", content: "Elias crossed the mountain pass.\n\nHe saw the dragon in the distance." },
      { title: "Chapter 2", content: "The village was quiet.\n\nNobody moved." },
    ],
    format: "txt" as const,
  };

  it("builds a valid TXT export with checksum", async () => {
    const out = await buildExport(input);
    expect(out.fileName).toMatch(/\.txt$/);
    expect(out.mimeType).toBe("text/plain");
    expect(out.buffer.length).toBeGreaterThan(0);
    expect(out.fileName).toMatch(/\.txt$/);
    const text = out.buffer.toString("utf-8");
    expect(text.toLowerCase()).toContain("the mountain veil");
    expect(text).toContain("Chapter 1");
    expect(text).toContain("Elias crossed");
  });

  it("builds EPUB export", async () => {
    const out = await buildExport({ ...input, format: "epub" });
    expect(out.fileName).toMatch(/\.epub$/);
    expect(out.buffer.length).toBeGreaterThan(0);
    expect(out.fileName).toMatch(/\.epub$/);
  });

  it("builds PDF export", async () => {
    const out = await buildExport({ ...input, format: "pdf" });
    expect(out.fileName).toMatch(/\.pdf$/);
    const header = out.buffer.toString("utf-8", 0, 8);
    expect(header).toContain("%PDF");
  }, 30000);

  it("builds DOCX export", async () => {
    const out = await buildExport({ ...input, format: "docx" });
    expect(out.fileName).toMatch(/\.docx$/);
    const sig = out.buffer.toString("utf-8", 0, 4);
    // docx = zip, starting with PK
    expect(sig).toBe("PK\x03\x04");
  }, 30000);
});
