/**
 * Pure one-page PDF renderer for the HSA/FSA annual expense summary (gap 33).
 *
 * Mirrors the care-plan renderer's brand palette + Helvetica fonts so the two
 * exports look like a set. Takes already-loaded rows (no DB / network) so it
 * can be unit-tested directly. The seeker exports this to give their HSA/FSA
 * plan administrator one document totalling the eligible care expenses.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type RGB,
} from "pdf-lib";
import { formatUsd, type HsaSummaryItem } from "./summary-handler";

export type HsaPdfInput = {
  year: number;
  totalCents: number;
  count: number;
  payments: HsaSummaryItem[];
  seekerName: string | null;
  generatedAt: Date;
};

const TEAL: RGB = rgb(0x03 / 255, 0x9e / 255, 0xa0 / 255);
const INK: RGB = rgb(0x0f / 255, 0x14 / 255, 0x16 / 255);
const MUTED: RGB = rgb(0x6b / 255, 0x72 / 255, 0x80 / 255);
const CREAM: RGB = rgb(0xf4 / 255, 0xef / 255, 0xe6 / 255);
const BORDER: RGB = rgb(0xd4 / 255, 0xd1 / 255, 0xca / 255);
const ACCENT: RGB = rgb(0xf4 / 255, 0xa2 / 255, 0x61 / 255);

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_X = 48;
const BODY_SIZE = 11;
const LEADING = 16;

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, size) > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

/** Render the HSA/FSA summary PDF and return the bytes. */
export async function renderHsaSummaryPdf(
  input: HsaPdfInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`HSA/FSA Expense Summary ${input.year}`);
  pdf.setProducer("SpecialCarers");
  pdf.setCreator("SpecialCarers HSA/FSA Summary PDF");
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE_W, PAGE_H]);

  // Header.
  page.drawText("SpecialCarers", {
    x: MARGIN_X,
    y: PAGE_H - 48,
    size: 14,
    font: helvBold,
    color: TEAL,
  });
  page.drawText("HSA / FSA Expense Summary", {
    x: MARGIN_X,
    y: PAGE_H - 70,
    size: 18,
    font: helvBold,
    color: TEAL,
  });
  const yearLabel = `Tax year ${input.year}`;
  const ylw = helv.widthOfTextAtSize(yearLabel, 11);
  page.drawText(yearLabel, {
    x: PAGE_W - MARGIN_X - ylw,
    y: PAGE_H - 48,
    size: 11,
    font: helv,
    color: INK,
  });
  page.drawLine({
    start: { x: MARGIN_X, y: PAGE_H - 82 },
    end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 82 },
    thickness: 0.6,
    color: BORDER,
  });

  // Summary panel (total + count).
  const panelY = PAGE_H - 82 - 12 - 84;
  page.drawRectangle({
    x: MARGIN_X,
    y: panelY,
    width: PAGE_W - MARGIN_X * 2,
    height: 84,
    color: CREAM,
    borderColor: BORDER,
    borderWidth: 1,
  });
  if (input.seekerName) {
    page.drawText(`Account holder: ${input.seekerName}`.slice(0, 80), {
      x: MARGIN_X + 16,
      y: panelY + 84 - 24,
      size: BODY_SIZE,
      font: helv,
      color: INK,
    });
  }
  page.drawText("Total eligible expenses", {
    x: MARGIN_X + 16,
    y: panelY + 30,
    size: BODY_SIZE,
    font: helv,
    color: MUTED,
  });
  page.drawText(formatUsd(input.totalCents), {
    x: MARGIN_X + 16,
    y: panelY + 8,
    size: 22,
    font: helvBold,
    color: INK,
  });
  const countLabel = `${input.count} payment${input.count === 1 ? "" : "s"}`;
  const clw = helvBold.widthOfTextAtSize(countLabel, 14);
  page.drawText(countLabel, {
    x: PAGE_W - MARGIN_X - 16 - clw,
    y: panelY + 12,
    size: 14,
    font: helvBold,
    color: TEAL,
  });

  // Table.
  let y = panelY - 24;
  page.drawRectangle({
    x: MARGIN_X,
    y: y - 2,
    width: 22,
    height: 3,
    color: ACCENT,
  });
  page.drawText("Eligible payments", {
    x: MARGIN_X + 30,
    y: y - 12,
    size: 14,
    font: helvBold,
    color: TEAL,
  });
  y -= 28;

  const colX = [MARGIN_X, MARGIN_X + 110, MARGIN_X + 330, PAGE_W - MARGIN_X];
  // Header row.
  page.drawRectangle({
    x: MARGIN_X,
    y: y - LEADING + 2,
    width: PAGE_W - MARGIN_X * 2,
    height: LEADING,
    color: CREAM,
    borderColor: BORDER,
    borderWidth: 0.5,
  });
  page.drawText("Date", {
    x: colX[0] + 6,
    y: y - BODY_SIZE,
    size: BODY_SIZE,
    font: helvBold,
    color: INK,
  });
  page.drawText("Caregiver", {
    x: colX[1] + 6,
    y: y - BODY_SIZE,
    size: BODY_SIZE,
    font: helvBold,
    color: INK,
  });
  const amtHdrW = helvBold.widthOfTextAtSize("Amount", BODY_SIZE);
  page.drawText("Amount", {
    x: colX[3] - 6 - amtHdrW,
    y: y - BODY_SIZE,
    size: BODY_SIZE,
    font: helvBold,
    color: INK,
  });
  y -= LEADING;

  if (input.payments.length === 0) {
    page.drawText("No eligible payments tagged for this year.", {
      x: MARGIN_X + 6,
      y: y - BODY_SIZE,
      size: BODY_SIZE,
      font: helv,
      color: MUTED,
    });
    y -= LEADING;
  } else {
    for (const p of input.payments) {
      if (y - LEADING < 80) break; // single page — stop before the footer
      page.drawLine({
        start: { x: MARGIN_X, y: y + 2 },
        end: { x: PAGE_W - MARGIN_X, y: y + 2 },
        thickness: 0.4,
        color: BORDER,
      });
      page.drawText(fmtDate(p.paidAt), {
        x: colX[0] + 6,
        y: y - BODY_SIZE,
        size: BODY_SIZE,
        font: helv,
        color: INK,
      });
      const name = truncateToWidth(
        p.caregiverName ?? "—",
        helv,
        BODY_SIZE,
        colX[2] - colX[1] - 12,
      );
      page.drawText(name, {
        x: colX[1] + 6,
        y: y - BODY_SIZE,
        size: BODY_SIZE,
        font: helv,
        color: INK,
      });
      const amt = formatUsd(p.amountCents);
      const aw = helv.widthOfTextAtSize(amt, BODY_SIZE);
      page.drawText(amt, {
        x: colX[3] - 6 - aw,
        y: y - BODY_SIZE,
        size: BODY_SIZE,
        font: helv,
        color: INK,
      });
      y -= LEADING;
    }
  }
  page.drawLine({
    start: { x: MARGIN_X, y: y + 2 },
    end: { x: PAGE_W - MARGIN_X, y: y + 2 },
    thickness: 0.4,
    color: BORDER,
  });

  // Footer.
  page.drawText(
    `Generated by SpecialCarers on ${fmtDateTime(input.generatedAt)}`,
    {
      x: MARGIN_X,
      y: 40,
      size: 9,
      font: helv,
      color: MUTED,
    },
  );
  const disclaimer =
    "This summary is provided for your records. Consult your HSA/FSA plan administrator regarding eligibility.";
  page.drawText(truncateToWidth(disclaimer, helv, 8, PAGE_W - MARGIN_X * 2), {
    x: MARGIN_X,
    y: 26,
    size: 8,
    font: helv,
    color: MUTED,
  });

  return pdf.save();
}
