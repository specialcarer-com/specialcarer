/**
 * Render an organisation contract to a single, simple PDF using
 * pdf-lib. Strictly bullet/heading/paragraph fidelity — no tables, no
 * images. We intentionally keep it dumb so the bytes are auditable.
 */

import "server-only";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

export type ContractPdfArgs = {
  contractType: "msa" | "dpa";
  version: string;
  markdown: string;
  organizationName: string;
  signedByName: string | null;
  signedByRole: string | null;
  signedAt: Date | null;
  signatureIp: string | null;
  countersignName: string;
  countersignedAt: Date;
  legalReviewComment: string | null;
};

const PAGE_WIDTH = 595.28; // A4 portrait
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const LINE_HEIGHT = 14;
const HEADING_LINE_HEIGHT = 20;

type Style = "heading1" | "heading2" | "heading3" | "body" | "bullet" | "blockquote";

type Block = { style: Style; text: string };

function parseBlocks(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let para: string[] = [];
  function flushPara(style: Style = "body") {
    if (para.length) {
      blocks.push({ style, text: para.join(" ").trim() });
      para = [];
    }
  }
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushPara();
      continue;
    }
    if (line.startsWith("> ")) {
      flushPara();
      blocks.push({ style: "blockquote", text: line.slice(2) });
      continue;
    }
    if (line.startsWith("# ")) {
      flushPara();
      blocks.push({ style: "heading1", text: line.slice(2) });
      continue;
    }
    if (line.startsWith("## ")) {
      flushPara();
      blocks.push({ style: "heading2", text: line.slice(3) });
      continue;
    }
    if (line.startsWith("### ")) {
      flushPara();
      blocks.push({ style: "heading3", text: line.slice(4) });
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      flushPara();
      blocks.push({ style: "bullet", text: line.replace(/^[-*]\s+/, "") });
      continue;
    }
    if (/^\|/.test(line)) {
      // Skip markdown tables — preserve as plain text.
      flushPara();
      blocks.push({ style: "body", text: line.replace(/\|/g, " · ").trim() });
      continue;
    }
    para.push(line);
  }
  flushPara();
  return blocks;
}

function stripInlineMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    const width = font.widthOfTextAtSize(candidate, fontSize);
    if (width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderContractPdf(args: ContractPdfArgs): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function newPage() {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) newPage();
  }

  function drawWrapped(
    text: string,
    use: PDFFont,
    size: number,
    indent: number,
    bullet?: boolean,
  ) {
    const maxWidth = PAGE_WIDTH - MARGIN * 2 - indent;
    const lines = wrapText(text, use, size, maxWidth);
    for (let i = 0; i < lines.length; i += 1) {
      ensureSpace(LINE_HEIGHT);
      const xText = MARGIN + indent;
      if (bullet && i === 0) {
        page.drawText("•", {
          x: MARGIN + indent - 12,
          y: y - size,
          size,
          font: bold,
          color: rgb(0.06, 0.49, 0.49),
        });
      }
      page.drawText(lines[i], {
        x: xText,
        y: y - size,
        size,
        font: use,
        color: rgb(0.18, 0.18, 0.19),
      });
      y -= LINE_HEIGHT;
    }
  }

  function gap(amount: number) {
    y -= amount;
  }

  // Letterhead.
  drawWrapped(
    "All Care 4 U Group Ltd t/a SpecialCarer",
    bold,
    14,
    0,
  );
  gap(2);
  drawWrapped(
    `Generated ${args.countersignedAt.toISOString().slice(0, 10)} · Version ${args.version}`,
    font,
    9,
    0,
  );
  gap(8);

  // Body.
  const blocks = parseBlocks(args.markdown);
  for (const b of blocks) {
    const cleaned = stripInlineMarkdown(b.text);
    if (b.style === "heading1") {
      gap(8);
      ensureSpace(HEADING_LINE_HEIGHT);
      drawWrapped(cleaned, bold, 16, 0);
      gap(2);
    } else if (b.style === "heading2") {
      gap(6);
      drawWrapped(cleaned, bold, 12, 0);
      gap(1);
    } else if (b.style === "heading3") {
      gap(4);
      drawWrapped(cleaned, bold, 10.5, 0);
    } else if (b.style === "blockquote") {
      drawWrapped(cleaned, font, 9, 12);
      gap(4);
    } else if (b.style === "bullet") {
      drawWrapped(cleaned, font, 10, 16, true);
    } else {
      drawWrapped(cleaned, font, 10, 0);
      gap(2);
    }
  }

  // Signature block at the bottom of a fresh page if we're tight.
  ensureSpace(140);
  gap(16);
  drawWrapped("Signed for the Customer", bold, 11, 0);
  gap(2);
  drawWrapped(`Organisation: ${args.organizationName}`, font, 10, 0);
  drawWrapped(`Name: ${args.signedByName ?? "—"}`, font, 10, 0);
  drawWrapped(`Role: ${args.signedByRole ?? "—"}`, font, 10, 0);
  drawWrapped(
    `Date: ${args.signedAt ? args.signedAt.toISOString() : "—"}`,
    font,
    10,
    0,
  );
  if (args.signatureIp) {
    drawWrapped(`Signature IP: ${args.signatureIp}`, font, 9, 0);
  }
  if (args.legalReviewComment) {
    gap(4);
    drawWrapped(
      `Legal-review note: ${args.legalReviewComment.slice(0, 480)}`,
      font,
      9,
      0,
    );
  }

  gap(12);
  drawWrapped(
    "Countersigned for All Care 4 U Group Ltd t/a SpecialCarer",
    bold,
    11,
    0,
  );
  gap(2);
  drawWrapped(`Name: ${args.countersignName}`, font, 10, 0);
  drawWrapped(
    `Date: ${args.countersignedAt.toISOString()}`,
    font,
    10,
    0,
  );

  return pdf.save();
}
