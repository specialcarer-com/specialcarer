/**
 * Payslip PDF generator using pdf-lib.
 *
 * Renders a single-page A4 payslip with the SpecialCarer brand identity:
 * teal #0E7C7B titles, accent #F4A261, slate body text. The page is fully
 * deterministic — same inputs always produce byte-equivalent output, which
 * helps with idempotency on re-runs.
 *
 * Returns a Uint8Array of the PDF bytes — caller uploads to Supabase
 * storage and stores the URL on org_carer_payouts.payslip_pdf_url.
 */

import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

const TEAL = rgb(0x0e / 255, 0x7c / 255, 0x7b / 255);
const ACCENT = rgb(0xf4 / 255, 0xa2 / 255, 0x61 / 255);
const SLATE = rgb(0.2, 0.23, 0.27);
const MUTED = rgb(0.45, 0.48, 0.52);
const HAIRLINE = rgb(0.85, 0.86, 0.88);

export type PayslipData = {
  employer_name: string; // "All Care 4 U Group Ltd"
  employer_address?: string;
  employee_name: string;
  employee_id?: string; // last 4 of carer UUID
  tax_code: string;
  ni_number?: string | null;
  period_label: string; // e.g. "April 2026"
  period_start: string; // ISO
  period_end: string; // ISO
  pay_date: string; // ISO
  is_draft: boolean; // true during preview window
  gross_cents: number;
  paye_cents: number;
  ni_employee_cents: number;
  ni_employer_cents: number;
  holiday_accrued_cents: number;
  net_cents: number;
  ytd_gross_cents: number;
  ytd_paye_cents: number;
  ytd_ni_cents: number;
  ytd_net_cents: number;
  // Optional line items by booking
  items?: Array<{ booking_id: string; hours?: number; pay_cents: number }>;
};

function gbp(p: number): string {
  const n = p / 100;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function drawText(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color = SLATE,
) {
  page.drawText(text, { x, y, size, font, color });
}

export async function renderPayslipPdf(data: PayslipData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Payslip ${data.period_label} — ${data.employee_name}`);
  doc.setAuthor(data.employer_name);
  doc.setSubject("Payslip");
  doc.setProducer("SpecialCarer Payroll");

  const page = doc.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();
  const margin = 48;

  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await doc.embedFont(StandardFonts.Helvetica);

  // Header bar
  page.drawRectangle({
    x: 0,
    y: height - 84,
    width,
    height: 84,
    color: TEAL,
  });
  drawText(page, "PAYSLIP", margin, height - 50, 22, fontBold, rgb(1, 1, 1));
  drawText(
    page,
    data.employer_name,
    margin,
    height - 70,
    11,
    fontReg,
    rgb(1, 1, 1),
  );

  if (data.is_draft) {
    drawText(page, "DRAFT — PREVIEW", width - margin - 130, height - 50, 12, fontBold, ACCENT);
    drawText(
      page,
      "review before payroll run",
      width - margin - 130,
      height - 66,
      8,
      fontReg,
      rgb(1, 1, 1),
    );
  }

  // Period info block
  let y = height - 120;
  drawText(page, "Employee", margin, y, 8, fontBold, MUTED);
  drawText(page, "Pay period", width / 2, y, 8, fontBold, MUTED);
  y -= 14;
  drawText(page, data.employee_name, margin, y, 12, fontBold);
  drawText(page, data.period_label, width / 2, y, 12, fontBold);
  y -= 14;
  if (data.employee_id) {
    drawText(page, `ID ${data.employee_id}`, margin, y, 9, fontReg, MUTED);
  }
  drawText(
    page,
    `${fmtDate(data.period_start)} – ${fmtDate(data.period_end)}`,
    width / 2,
    y,
    9,
    fontReg,
    MUTED,
  );
  y -= 12;
  drawText(page, `Tax code ${data.tax_code}`, margin, y, 9, fontReg, MUTED);
  drawText(page, `Pay date ${fmtDate(data.pay_date)}`, width / 2, y, 9, fontReg, MUTED);

  // Earnings table
  y -= 30;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    color: HAIRLINE,
    thickness: 1,
  });
  y -= 18;
  drawText(page, "Earnings & deductions", margin, y, 10, fontBold, TEAL);
  y -= 18;

  const rows: Array<[string, number, "credit" | "debit" | "info"]> = [
    ["Gross pay", data.gross_cents, "credit"],
    ["PAYE income tax", data.paye_cents, "debit"],
    ["NI (employee)", data.ni_employee_cents, "debit"],
    ["Holiday accrued (12.07%)", data.holiday_accrued_cents, "info"],
  ];
  for (const [label, val, kind] of rows) {
    drawText(page, label, margin + 4, y, 10, fontReg);
    const sign = kind === "debit" ? "−" : kind === "info" ? " " : "+";
    const color = kind === "info" ? MUTED : SLATE;
    drawText(page, `${sign} ${gbp(val)}`, width - margin - 90, y, 10, fontReg, color);
    y -= 16;
  }

  // Net pay row — highlighted
  y -= 4;
  page.drawRectangle({
    x: margin,
    y: y - 6,
    width: width - 2 * margin,
    height: 28,
    color: rgb(0.96, 0.97, 0.97),
  });
  drawText(page, "Net pay (BACS to your bank)", margin + 8, y + 6, 11, fontBold, TEAL);
  drawText(page, gbp(data.net_cents), width - margin - 90, y + 6, 12, fontBold, TEAL);

  // Employer contributions (informational)
  y -= 38;
  drawText(
    page,
    `Employer NI contributed for you this period: ${gbp(data.ni_employer_cents)} (not deducted)`,
    margin,
    y,
    8,
    fontReg,
    MUTED,
  );

  // YTD section
  y -= 30;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    color: HAIRLINE,
    thickness: 1,
  });
  y -= 18;
  drawText(page, "Year to date", margin, y, 10, fontBold, TEAL);
  y -= 18;
  const ytd: Array<[string, number]> = [
    ["Gross pay YTD", data.ytd_gross_cents + data.gross_cents],
    ["PAYE YTD", data.ytd_paye_cents + data.paye_cents],
    ["NI YTD", data.ytd_ni_cents + data.ni_employee_cents],
    ["Net pay YTD", data.ytd_net_cents + data.net_cents],
  ];
  for (const [label, val] of ytd) {
    drawText(page, label, margin + 4, y, 10, fontReg);
    drawText(page, gbp(val), width - margin - 90, y, 10, fontReg);
    y -= 16;
  }

  // Items (optional, compact)
  if (data.items && data.items.length > 0 && y > 160) {
    y -= 20;
    drawText(page, "Shifts included", margin, y, 10, fontBold, TEAL);
    y -= 14;
    const maxItems = Math.min(data.items.length, Math.floor((y - 140) / 12));
    for (let i = 0; i < maxItems; i++) {
      const it = data.items[i]!;
      const label = `Booking ${it.booking_id.slice(0, 8)}${it.hours ? ` · ${it.hours.toFixed(2)} hrs` : ""}`;
      drawText(page, label, margin + 4, y, 9, fontReg, MUTED);
      drawText(page, gbp(it.pay_cents), width - margin - 90, y, 9, fontReg, MUTED);
      y -= 12;
    }
    if (data.items.length > maxItems) {
      drawText(
        page,
        `… and ${data.items.length - maxItems} more shift(s)`,
        margin + 4,
        y,
        8,
        fontReg,
        MUTED,
      );
    }
  }

  // Footer
  drawText(
    page,
    `${data.employer_name} · Payroll generated by SpecialCarer`,
    margin,
    40,
    7,
    fontReg,
    MUTED,
  );
  if (data.is_draft) {
    drawText(
      page,
      "This is a DRAFT payslip — please review and flag any disputes before payroll runs.",
      margin,
      52,
      8,
      fontBold,
      ACCENT,
    );
  }

  return await doc.save();
}
