import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { CANDIDATE_CONSENT_DECLARATION, type ReferenceConsent } from "./consent";

const A4: [number, number] = [595.28, 841.89]; const MARGIN = 48;
function wrap(text: string, font: PDFFont, size: number, max: number) { const out: string[] = []; let line = ""; for (const word of text.split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (line && font.widthOfTextAtSize(next, size) > max) { out.push(line); line = word; } else line = next; } if (line) out.push(line); return out; }

export async function generateConsentPdf(consent: ReferenceConsent): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); const page = pdf.addPage(A4); const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold); const { width, height } = page.getSize(); let y = height - MARGIN;
  try { const bytes = await readFile(path.join(process.cwd(), "public/brand/logo-wordmark-email.png")); const image = await pdf.embedPng(bytes); const s = Math.min(150 / image.width, 36 / image.height); page.drawImage(image, { x: MARGIN, y: y - image.height * s, width: image.width * s, height: image.height * s }); } catch { page.drawText("SpecialCarer", { x: MARGIN, y: y - 20, size: 20, font: bold, color: rgb(0.01, 0.62, 0.63) }); }
  y -= 56; page.drawText("Candidate Disclosure Consent — Reference Collection", { x: MARGIN, y, size: 16, font: bold, color: rgb(.06,.08,.09) }); y -= 32;
  for (const [label, value] of [["Full name", consent.full_name], ["Date of birth", new Date(`${consent.date_of_birth}T00:00:00`).toLocaleDateString("en-GB")], ["National Insurance number", consent.national_insurance_number ?? "Not provided"]]) { page.drawText(`${label}:`, { x: MARGIN, y, size: 10, font: bold }); page.drawText(value, { x: MARGIN + 125, y, size: 10, font: regular }); y -= 17; }
  y -= 10; page.drawText("Declaration", { x: MARGIN, y, size: 11, font: bold }); y -= 16;
  for (const line of wrap(CANDIDATE_CONSENT_DECLARATION(consent.full_name), regular, 9.4, width - MARGIN * 2)) { page.drawText(line, { x: MARGIN, y, size: 9.4, font: regular, color: rgb(.1,.12,.14) }); y -= 13; }
  y -= 8; page.drawText("Signature", { x: MARGIN, y, size: 11, font: bold }); y -= 72;
  try { const signature = await pdf.embedPng(Buffer.from(consent.signature_data_url.replace(/^data:image\/png;base64,/, ""), "base64")); const s = Math.min(220 / signature.width, 58 / signature.height); page.drawImage(signature, { x: MARGIN, y, width: signature.width * s, height: signature.height * s }); } catch { page.drawText("Signature image unavailable", { x: MARGIN, y: y + 20, size: 9, font: regular }); }
  let footerY = 86; for (const text of [`Signed: ${new Date(consent.signed_at).toLocaleString("en-GB")}`, `IP address: ${consent.signed_ip ?? "Unavailable"}`, `User agent: ${(consent.signed_ua ?? "Unavailable").slice(0, 100)}`, "Retained per CQC Health and Social Care Act 2008 (Regulated Activities) Regulations 2014, Schedule 3."]) { page.drawText(text, { x: MARGIN, y: footerY, size: 7.4, font: regular, color: rgb(.3,.33,.35) }); footerY -= 10; }
  return pdf.save({ useObjectStreams: false });
}
