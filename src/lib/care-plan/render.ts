/**
 * Pure PDF renderer for the care-plan export.
 *
 * Takes already-loaded rows and produces a multi-page A4 portrait PDF.
 * No DB / network access — the handler in pdf-handler.ts loads the data
 * and calls this with plain objects, so tests can drive either layer
 * independently.
 *
 * Typography: Plus Jakarta Sans is the brand font but no TTF is bundled
 * in the repo. We use StandardFonts.Helvetica + HelveticaBold so the
 * PDF embeds nothing extra (keeps payload small, matches the existing
 * training certificate renderer). When a TTF is added under
 * public/fonts/ we can swap to pdf.embedFont(ttfBytes) here without
 * touching callers.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import {
  type AllergyRow,
  type BookingTaskRowMinimal,
  type CarePlanBookingRow,
  type CarePlanProfileRow,
  type CarePlanRow,
  type EmergencyContactRow,
  type MedicationRow,
  verticalLabel,
} from "./types";

export type CarePlanRenderInput = {
  booking: CarePlanBookingRow;
  carePlan: CarePlanRow | null;
  medications: MedicationRow[];
  allergies: AllergyRow[];
  tasks: BookingTaskRowMinimal[];
  emergencyContacts: EmergencyContactRow[];
  seeker: CarePlanProfileRow | null;
  carer: CarePlanProfileRow | null;
  generatedAt: Date;
};

// Brand palette (mirrors public/brand and existing PDF generators).
const TEAL: RGB = rgb(0x03 / 255, 0x9e / 255, 0xa0 / 255);
const INK: RGB = rgb(0x0f / 255, 0x14 / 255, 0x16 / 255);
const MUTED: RGB = rgb(0x6b / 255, 0x72 / 255, 0x80 / 255);
const CREAM: RGB = rgb(0xf4 / 255, 0xef / 255, 0xe6 / 255);
const BORDER: RGB = rgb(0xd4 / 255, 0xd1 / 255, 0xca / 255);
const ACCENT: RGB = rgb(0xf4 / 255, 0xa2 / 255, 0x61 / 255);

// A4 portrait — 595 x 842 points.
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_X = 48;
const HEADER_H = 64;
const FOOTER_H = 44;
const CONTENT_TOP = PAGE_H - HEADER_H - 8;
const CONTENT_BOTTOM = FOOTER_H + 8;

const BODY_SIZE = 11;
const LEADING = 16; // ~1.45 * 11
const H2_SIZE = 14;
const H2_LEADING = 22;

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Word-wrap a string for `font` at `size` to fit within `maxWidth`. */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    const words = para.split(/\s+/);
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) out.push(line);
        // Single very-long word — hard split.
        if (font.widthOfTextAtSize(w, size) > maxWidth) {
          let chunk = "";
          for (const ch of w) {
            if (
              font.widthOfTextAtSize(chunk + ch, size) <= maxWidth ||
              chunk.length === 0
            ) {
              chunk += ch;
            } else {
              out.push(chunk);
              chunk = ch;
            }
          }
          line = chunk;
        } else {
          line = w;
        }
      }
    }
    if (line) out.push(line);
  }
  return out;
}

type RenderCtx = {
  pdf: PDFDocument;
  pages: PDFPage[];
  helv: PDFFont;
  helvBold: PDFFont;
  /** y-cursor on the current page, decreasing as we write down. */
  y: number;
};

function newPage(ctx: RenderCtx): PDFPage {
  const page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.pages.push(page);
  ctx.y = CONTENT_TOP;
  return page;
}

function currentPage(ctx: RenderCtx): PDFPage {
  return ctx.pages[ctx.pages.length - 1];
}

function ensureSpace(ctx: RenderCtx, needed: number): PDFPage {
  if (ctx.y - needed < CONTENT_BOTTOM) {
    return newPage(ctx);
  }
  return currentPage(ctx);
}

function drawHeading(ctx: RenderCtx, text: string) {
  ensureSpace(ctx, H2_LEADING + 8);
  const page = currentPage(ctx);
  // Small accent rule.
  page.drawRectangle({
    x: MARGIN_X,
    y: ctx.y - 2,
    width: 22,
    height: 3,
    color: ACCENT,
  });
  page.drawText(text, {
    x: MARGIN_X + 30,
    y: ctx.y - H2_SIZE + 2,
    size: H2_SIZE,
    font: ctx.helvBold,
    color: TEAL,
  });
  ctx.y -= H2_LEADING;
}

function drawBodyLine(
  ctx: RenderCtx,
  text: string,
  opts?: { bold?: boolean; color?: RGB; indent?: number },
) {
  ensureSpace(ctx, LEADING);
  const page = currentPage(ctx);
  page.drawText(text, {
    x: MARGIN_X + (opts?.indent ?? 0),
    y: ctx.y - BODY_SIZE,
    size: BODY_SIZE,
    font: opts?.bold ? ctx.helvBold : ctx.helv,
    color: opts?.color ?? INK,
  });
  ctx.y -= LEADING;
}

function drawWrapped(
  ctx: RenderCtx,
  text: string,
  opts?: { bold?: boolean; color?: RGB; indent?: number },
) {
  const font = opts?.bold ? ctx.helvBold : ctx.helv;
  const indent = opts?.indent ?? 0;
  const maxWidth = PAGE_W - MARGIN_X * 2 - indent;
  const lines = wrap(text, font, BODY_SIZE, maxWidth);
  for (const line of lines) {
    drawBodyLine(ctx, line, opts);
  }
}

function drawBullet(ctx: RenderCtx, text: string) {
  // Bullet glyph + wrapped text.
  ensureSpace(ctx, LEADING);
  const page = currentPage(ctx);
  page.drawText("•", {
    x: MARGIN_X,
    y: ctx.y - BODY_SIZE,
    size: BODY_SIZE,
    font: ctx.helvBold,
    color: TEAL,
  });
  const maxWidth = PAGE_W - MARGIN_X * 2 - 14;
  const lines = wrap(text, ctx.helv, BODY_SIZE, maxWidth);
  if (lines.length === 0) {
    ctx.y -= LEADING;
    return;
  }
  // First line aligned with the bullet.
  page.drawText(lines[0], {
    x: MARGIN_X + 14,
    y: ctx.y - BODY_SIZE,
    size: BODY_SIZE,
    font: ctx.helv,
    color: INK,
  });
  ctx.y -= LEADING;
  for (let i = 1; i < lines.length; i++) {
    ensureSpace(ctx, LEADING);
    const p = currentPage(ctx);
    p.drawText(lines[i], {
      x: MARGIN_X + 14,
      y: ctx.y - BODY_SIZE,
      size: BODY_SIZE,
      font: ctx.helv,
      color: INK,
    });
    ctx.y -= LEADING;
  }
}

function drawSpacer(ctx: RenderCtx, h = 6) {
  ctx.y -= h;
}

function drawCoverBlock(ctx: RenderCtx, input: CarePlanRenderInput) {
  const seekerName =
    input.carePlan?.recipient_name?.trim() ||
    input.seeker?.full_name?.trim() ||
    "Care recipient";
  const carerName = input.carer?.full_name?.trim() || "Carer to be assigned";

  // Cream panel.
  const panelH = 110;
  ensureSpace(ctx, panelH + 8);
  const page = currentPage(ctx);
  const panelY = ctx.y - panelH;
  page.drawRectangle({
    x: MARGIN_X,
    y: panelY,
    width: PAGE_W - MARGIN_X * 2,
    height: panelH,
    color: CREAM,
    borderColor: BORDER,
    borderWidth: 1,
  });

  // Big seeker name.
  page.drawText(seekerName.slice(0, 64), {
    x: MARGIN_X + 16,
    y: ctx.y - 26,
    size: 22,
    font: ctx.helvBold,
    color: INK,
  });

  // Carer line.
  page.drawText(`Carer: ${carerName.slice(0, 64)}`, {
    x: MARGIN_X + 16,
    y: ctx.y - 48,
    size: BODY_SIZE,
    font: ctx.helv,
    color: INK,
  });

  // Date range.
  const start = parseDate(input.booking.starts_at);
  const end = parseDate(input.booking.ends_at);
  const range = start
    ? `${fmtDate(start)} to ${end ? fmtDate(end) : "ongoing"}`
    : "Schedule TBC";
  page.drawText(range, {
    x: MARGIN_X + 16,
    y: ctx.y - 66,
    size: BODY_SIZE,
    font: ctx.helv,
    color: INK,
  });

  // Address.
  const cp = input.carePlan;
  const addrParts: string[] = [];
  if (cp?.address_line1) addrParts.push(cp.address_line1);
  if (cp?.address_line2) addrParts.push(cp.address_line2);
  const cityLine = [cp?.city, cp?.postcode].filter(Boolean).join(" ");
  if (cityLine) addrParts.push(cityLine);
  if (!addrParts.length && input.booking.location_city) {
    addrParts.push(input.booking.location_city);
  }
  const addrText = addrParts.length ? addrParts.join(", ") : "Address on file";
  page.drawText(addrText.slice(0, 110), {
    x: MARGIN_X + 16,
    y: ctx.y - 84,
    size: BODY_SIZE,
    font: ctx.helv,
    color: MUTED,
  });

  // Vertical pill (top-right of panel).
  const vlabel = verticalLabel(input.booking.service_type);
  const pillW = ctx.helvBold.widthOfTextAtSize(vlabel, 10) + 22;
  const pillX = PAGE_W - MARGIN_X - 16 - pillW;
  const pillY = ctx.y - 32;
  page.drawRectangle({
    x: pillX,
    y: pillY,
    width: pillW,
    height: 22,
    color: rgb(1, 1, 1),
    borderColor: TEAL,
    borderWidth: 1,
  });
  page.drawText(vlabel, {
    x: pillX + 11,
    y: pillY + 7,
    size: 10,
    font: ctx.helvBold,
    color: TEAL,
  });

  ctx.y = panelY - 14;
}

function drawGoals(ctx: RenderCtx, goals: string[] | null | undefined) {
  drawHeading(ctx, "Care goals");
  const g = (goals ?? []).filter((s) => s && s.trim().length > 0);
  if (g.length === 0) {
    drawBodyLine(ctx, "No care goals recorded.", { color: MUTED });
  } else {
    for (const goal of g) drawBullet(ctx, goal.trim());
  }
  drawSpacer(ctx);
}

function drawTasks(ctx: RenderCtx, tasks: BookingTaskRowMinimal[]) {
  drawHeading(ctx, "Daily tasks");
  if (tasks.length === 0) {
    drawBodyLine(ctx, "No tasks yet.", { color: MUTED });
  } else {
    for (const t of tasks) {
      ensureSpace(ctx, LEADING);
      const page = currentPage(ctx);
      // Tick or empty box.
      const box = t.done ? "[x]" : "[ ]";
      page.drawText(box, {
        x: MARGIN_X,
        y: ctx.y - BODY_SIZE,
        size: BODY_SIZE,
        font: ctx.helvBold,
        color: t.done ? TEAL : MUTED,
      });
      const labelMax = PAGE_W - MARGIN_X * 2 - 28 - 130;
      const labelLines = wrap(t.label, ctx.helv, BODY_SIZE, labelMax);
      const first = labelLines[0] ?? "";
      page.drawText(first, {
        x: MARGIN_X + 24,
        y: ctx.y - BODY_SIZE,
        size: BODY_SIZE,
        font: ctx.helv,
        color: INK,
      });
      if (t.done && t.done_at) {
        const stamp = fmtDateTime(parseDate(t.done_at));
        const sw = ctx.helv.widthOfTextAtSize(stamp, 9);
        page.drawText(stamp, {
          x: PAGE_W - MARGIN_X - sw,
          y: ctx.y - BODY_SIZE,
          size: 9,
          font: ctx.helv,
          color: MUTED,
        });
      }
      ctx.y -= LEADING;
      for (let i = 1; i < labelLines.length; i++) {
        drawBodyLine(ctx, labelLines[i], { indent: 24 });
      }
    }
  }
  drawSpacer(ctx);
}

function drawTable(
  ctx: RenderCtx,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  emptyMsg: string,
) {
  if (rows.length === 0) {
    drawBodyLine(ctx, emptyMsg, { color: MUTED });
    return;
  }
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  // Header row.
  ensureSpace(ctx, LEADING + 4);
  let page = currentPage(ctx);
  page.drawRectangle({
    x: MARGIN_X,
    y: ctx.y - LEADING + 2,
    width: totalW,
    height: LEADING,
    color: CREAM,
    borderColor: BORDER,
    borderWidth: 0.5,
  });
  let cx = MARGIN_X;
  for (let c = 0; c < headers.length; c++) {
    page.drawText(headers[c], {
      x: cx + 6,
      y: ctx.y - BODY_SIZE,
      size: BODY_SIZE,
      font: ctx.helvBold,
      color: INK,
    });
    cx += colWidths[c];
  }
  ctx.y -= LEADING;

  for (const row of rows) {
    // Pre-wrap each cell, then row-height = max lines * LEADING.
    const cells = row.map((cell, i) =>
      wrap(cell || "—", ctx.helv, BODY_SIZE, colWidths[i] - 12),
    );
    const rowLines = Math.max(1, ...cells.map((c) => c.length));
    const rowH = rowLines * LEADING;
    ensureSpace(ctx, rowH + 2);
    page = currentPage(ctx);
    // Faint row border.
    page.drawLine({
      start: { x: MARGIN_X, y: ctx.y + 2 },
      end: { x: MARGIN_X + totalW, y: ctx.y + 2 },
      thickness: 0.4,
      color: BORDER,
    });
    cx = MARGIN_X;
    for (let c = 0; c < cells.length; c++) {
      const lines = cells[c];
      for (let li = 0; li < lines.length; li++) {
        page.drawText(lines[li], {
          x: cx + 6,
          y: ctx.y - BODY_SIZE - li * LEADING,
          size: BODY_SIZE,
          font: ctx.helv,
          color: INK,
        });
      }
      cx += colWidths[c];
    }
    ctx.y -= rowH;
  }
  // Closing line under table.
  ensureSpace(ctx, 2);
  page = currentPage(ctx);
  page.drawLine({
    start: { x: MARGIN_X, y: ctx.y + 2 },
    end: { x: MARGIN_X + totalW, y: ctx.y + 2 },
    thickness: 0.4,
    color: BORDER,
  });
}

function drawMedications(ctx: RenderCtx, meds: MedicationRow[]) {
  drawHeading(ctx, "Medications");
  const colW = [160, 90, 130, 119]; // total 499 (page-2*margin = 595-96=499)
  const rows = meds.map((m) => [
    m.name,
    m.dose ?? "—",
    m.schedule ?? "—",
    m.notes ?? "",
  ]);
  drawTable(
    ctx,
    ["Medication", "Dose", "Schedule", "Notes"],
    rows,
    colW,
    "No medications recorded.",
  );
  drawSpacer(ctx);
}

function drawAllergies(ctx: RenderCtx, allergies: AllergyRow[]) {
  drawHeading(ctx, "Allergies");
  if (allergies.length === 0) {
    drawBodyLine(ctx, "None recorded.", { color: MUTED });
    drawSpacer(ctx);
    return;
  }
  const colW = [150, 90, 130, 129];
  const rows = allergies.map((a) => [
    a.substance,
    (a.severity ?? "—").replace(/_/g, " "),
    a.reaction ?? "—",
    a.notes ?? "",
  ]);
  drawTable(
    ctx,
    ["Substance", "Severity", "Reaction", "Notes"],
    rows,
    colW,
    "None recorded.",
  );
  drawSpacer(ctx);
}

function drawEmergencyContacts(
  ctx: RenderCtx,
  contacts: EmergencyContactRow[],
) {
  drawHeading(ctx, "Emergency contacts");
  const colW = [180, 130, 189];
  const rows = contacts.map((c) => [
    c.name,
    c.relationship ?? "—",
    c.phone,
  ]);
  drawTable(
    ctx,
    ["Name", "Relationship", "Phone"],
    rows,
    colW,
    "No emergency contacts on file.",
  );
  drawSpacer(ctx);
}

function drawSpecialInstructions(ctx: RenderCtx, plan: CarePlanRow | null) {
  drawHeading(ctx, "Special instructions");
  const text = plan?.special_instructions?.trim();
  if (!text) {
    drawBodyLine(ctx, "None recorded.", { color: MUTED });
  } else {
    drawWrapped(ctx, text);
  }
  drawSpacer(ctx);

  const routine = plan?.routine_notes?.trim();
  if (routine) {
    drawHeading(ctx, "Routine notes");
    drawWrapped(ctx, routine);
    drawSpacer(ctx);
  }
}

function drawHeaderAndFooter(
  ctx: RenderCtx,
  input: CarePlanRenderInput,
  bookingRef: string,
) {
  const total = ctx.pages.length;
  for (let i = 0; i < total; i++) {
    const page = ctx.pages[i];

    // Header background line.
    page.drawRectangle({
      x: 0,
      y: PAGE_H - HEADER_H,
      width: PAGE_W,
      height: HEADER_H,
      color: rgb(1, 1, 1),
    });
    page.drawLine({
      start: { x: MARGIN_X, y: PAGE_H - HEADER_H + 4 },
      end: { x: PAGE_W - MARGIN_X, y: PAGE_H - HEADER_H + 4 },
      thickness: 0.6,
      color: BORDER,
    });

    // Brand "SpecialCarers" left.
    page.drawText("SpecialCarers", {
      x: MARGIN_X,
      y: PAGE_H - 32,
      size: 14,
      font: ctx.helvBold,
      color: TEAL,
    });
    // "Care Plan" title.
    page.drawText("Care Plan", {
      x: MARGIN_X,
      y: PAGE_H - 50,
      size: 18,
      font: ctx.helvBold,
      color: TEAL,
    });
    // Booking ref right.
    const refText = `Booking ${bookingRef}`;
    const refW = ctx.helv.widthOfTextAtSize(refText, 10);
    page.drawText(refText, {
      x: PAGE_W - MARGIN_X - refW,
      y: PAGE_H - 32,
      size: 10,
      font: ctx.helv,
      color: INK,
    });

    // Footer.
    const updated = parseDate(input.carePlan?.updated_at ?? null);
    const leftTxt = `Generated by SpecialCarers on ${fmtDateTime(input.generatedAt)}`;
    page.drawText(leftTxt, {
      x: MARGIN_X,
      y: 28,
      size: 9,
      font: ctx.helv,
      color: MUTED,
    });
    const pageLabel = `Page ${i + 1} of ${total}`;
    const pw = ctx.helv.widthOfTextAtSize(pageLabel, 9);
    page.drawText(pageLabel, {
      x: (PAGE_W - pw) / 2,
      y: 28,
      size: 9,
      font: ctx.helv,
      color: MUTED,
    });
    if (updated) {
      const v = `Plan version: ${fmtDate(updated)}`;
      const vw = ctx.helv.widthOfTextAtSize(v, 9);
      page.drawText(v, {
        x: PAGE_W - MARGIN_X - vw,
        y: 28,
        size: 9,
        font: ctx.helv,
        color: MUTED,
      });
    }
  }
}

/**
 * Render the care-plan PDF and return the bytes. The caller wraps these
 * in a NextResponse with the right Content-Type / Content-Disposition.
 */
export async function renderCarePlanPdf(
  input: CarePlanRenderInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Care Plan ${input.booking.id}`);
  pdf.setProducer("SpecialCarers");
  pdf.setCreator("SpecialCarers Care-Plan PDF");
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ctx: RenderCtx = { pdf, pages: [], helv, helvBold, y: CONTENT_TOP };
  newPage(ctx);

  drawCoverBlock(ctx, input);
  drawGoals(ctx, input.carePlan?.goals ?? null);
  drawTasks(ctx, input.tasks);
  drawMedications(ctx, input.medications);
  drawAllergies(ctx, input.allergies);
  drawEmergencyContacts(ctx, input.emergencyContacts);
  drawSpecialInstructions(ctx, input.carePlan);

  // Booking ref: short 8-char prefix for legibility.
  const bookingRef = input.booking.id.slice(0, 8);
  drawHeaderAndFooter(ctx, input, bookingRef);

  return pdf.save();
}
