/**
 * Manuscript export service.
 * Generates TXT / EPUB / PDF / DOCX from a project's chapters.
 * Heavy/binary formats are generated in the worker/process, not the browser.
 */
import { createHash } from "node:crypto";
import JSZip from "jszip";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType, Footer, PageNumber, Header } from "docx";

export interface ExportChapter {
  title: string;
  content: string;
}

export interface ExportInput {
  title: string;
  author: string;
  chapters: ExportChapter[];
  coverUrl?: string | null;
  format: "pdf" | "docx" | "epub" | "txt";
}

export interface ExportOutput {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  contentLength: number;
  fileHash: string;
}

function clean(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function chapterContents(chapters: ExportChapter[]): ExportChapter[] {
  return chapters.map((c) => ({ ...c, content: clean(c.content) }));
}

export async function buildExport(input: ExportInput): Promise<ExportOutput> {
  const chapters = chapterContents(input.chapters);
  const safeTitle = input.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60) || "manuscript";
  const fileNameBase = safeTitle;

  switch (input.format) {
    case "txt": return buildTxt(input.title, input.author, chapters, fileNameBase);
    case "epub": return buildEpub(input.title, input.author, chapters, fileNameBase);
    case "pdf": return buildPdf(input.title, input.author, chapters, fileNameBase);
    case "docx": return buildDocx(input.title, input.author, chapters, fileNameBase);
    default: throw new Error(`Unsupported export format: ${input.format}`);
  }
}

// ─── TXT ────────────────────────────────────────────────────────────────────
async function buildTxt(title: string, author: string, chapters: ExportChapter[], base: string): Promise<ExportOutput> {
  const lines: string[] = [title.toUpperCase(), "—".repeat(40), "", `by ${author}`, "", "TABLE OF CONTENTS", ""];
  chapters.forEach((c, i) => lines.push(`  ${i + 1}. ${c.title}`));
  lines.push("", "", "=".repeat(40), "");
  chapters.forEach((c, i) => {
    lines.push(`CHAPTER ${i + 1}: ${c.title}`, "");
    lines.push(c.content, "", "=".repeat(40), "");
  });
  const buffer = Buffer.from(lines.join("\n"), "utf8");
  return { buffer, mimeType: "text/plain", fileName: `${base}.txt`, contentLength: buffer.length, fileHash: createHash("sha256").update(buffer).digest("hex") };
}

// ─── EPUB ───────────────────────────────────────────────────────────────────
async function buildEpub(title: string, author: string, chapters: ExportChapter[], base: string): Promise<ExportOutput> {
  const zip = new JSZip();
  const now = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z";
  const uid = `urn:taleora:${base}:${Date.now().toString(36)}`;

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.folder("META-INF")?.file("container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);

  const manifest = chapters
    .map((c, i) => `<item id="chapter-${i}" href="chapter-${i}.xhtml" media-type="application/xhtml+xml"/>`)
    .join("\n    ");
  const spine = chapters.map((_, i) => `<itemref idref="chapter-${i}"/>`).join("\n    ");

  zip.folder("OEBPS")?.file("content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">${escapeXml(uid)}</dc:identifier>
    <dc:date>${now}</dc:date>
  </metadata>
  <manifest>
    ${manifest}
    <item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="toc">
    ${spine}
  </spine>
</package>`);

  const nav = chapters.map((c, i) => `<navPoint id="nav-${i}" playOrder="${i + 1}"><navLabel><text>${escapeXml(c.title)}</text></navLabel><content src="chapter-${i}.xhtml"/></navPoint>`).join("\n");
  zip.folder("OEBPS")?.file("toc.ncx", `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${escapeXml(uid)}"/></head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
    ${nav}
  </navMap>
</ncx>`);

  chapters.forEach((c, i) => {
    zip.folder("OEBPS")?.file(`chapter-${i}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(c.title)}</title></head>
<body>
  <h1>${escapeXml(c.title)}</h1>
  ${paragraphsToXhtml(c.content)}
</body>
</html>`);
  });

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, mimeType: "application/epub+zip", fileName: `${base}.epub`, contentLength: buffer.length, fileHash: createHash("sha256").update(buffer).digest("hex") };
}

function paragraphsToXhtml(content: string): string {
  return content.split(/\n\s*\n/).filter(Boolean).map((p) => `<p>${escapeXml(p.trim()).replace(/\n/g, "<br/>")}</p>`).join("\n  ");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// ─── PDF ────────────────────────────────────────────────────────────────────
async function buildPdf(title: string, author: string, chapters: ExportChapter[], base: string): Promise<ExportOutput> {
  const doc = new PDFDocument({ size: "A4", margin: 60, info: { Title: title, Author: author } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Cover page
  doc.fontSize(30).font("Times-Roman").text(title, { align: "center" });
  doc.moveDown(2);
  doc.fontSize(14).text(`by ${author}`, { align: "center" });
  doc.moveDown(3);
  doc.fontSize(12).fillColor("#555555").text("Taleora — AI-powered story writing", { align: "center" });
  doc.addPage();

  // TOC
  doc.fontSize(20).font("Times-Bold").fillColor("#000000").text("Table of Contents");
  doc.moveDown(1);
  doc.fontSize(12).font("Times-Roman");
  chapters.forEach((c, i) => {
    doc.text(`${i + 1}. ${c.title}`, { align: "left" });
    doc.moveDown(0.3);
  });
  doc.moveDown(2);

  chapters.forEach((c, i) => {
    doc.addPage();
    doc.fontSize(22).font("Times-Bold").fillColor("#000000").text(`Chapter ${i + 1}`);
    doc.fontSize(18).font("Times-Roman").text(c.title, { align: "left" });
    doc.moveDown(1);
    doc.fontSize(12).font("Times-Roman").list(c.content.split(/\n\s*\n/).filter(Boolean), {
      align: "left",
      lineGap: 8,
    });
  });

  doc.end();
  const buffer = await done;
  return { buffer, mimeType: "application/pdf", fileName: `${base}.pdf`, contentLength: buffer.length, fileHash: createHash("sha256").update(buffer).digest("hex") };
}

// ─── DOCX ───────────────────────────────────────────────────────────────────
async function buildDocx(title: string, author: string, chapters: ExportChapter[], base: string): Promise<ExportOutput> {
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: title, bold: true, size: 56 })],
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `by ${author}`, size: 28, italics: true })],
      spacing: { after: 600 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Table of Contents", bold: true, size: 32 })],
      spacing: { before: 400, after: 200 },
    }),
    ...chapters.map((c, i) => new Paragraph({
      children: [new TextRun({ text: `${i + 1}. ${c.title}`, size: 28 })],
      indent: { left: 400 },
    })),
    new Paragraph({ pageBreakBefore: true }),
    ...chapters.flatMap((c, i) => [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `Chapter ${i + 1}: ${c.title}`, bold: true })], spacing: { before: 400, after: 200 } }),
      ...c.content.split(/\n\s*\n/).filter(Boolean).map((p) => new Paragraph({ children: [new TextRun({ text: p.trim(), size: 24 })], spacing: { after: 200 }, alignment: AlignmentType.JUSTIFIED })),
    ]),
  ];

  const doc = new Document({
    creator: "Taleora",
    title,
    description: "Generated by Taleora",
    styles: {
      default: {
        document: {
          run: { font: "Georgia", size: 24 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 }, // A4 in dxa
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: `Taleora — ${title}`, size: 18, italics: true, color: "666666" })], alignment: AlignmentType.CENTER })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: "Taleora · Page ", size: 18, color: "666666" }), new TextRun({ children: [(PageNumber as any).CURRENT], size: 18, color: "666666" })], alignment: AlignmentType.CENTER })] }),
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return { buffer, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileName: `${base}.docx`, contentLength: buffer.length, fileHash: createHash("sha256").update(buffer).digest("hex") };
}
