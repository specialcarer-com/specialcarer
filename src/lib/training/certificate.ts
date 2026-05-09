import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type CertificateInput = {
  carerName: string;
  courseTitle: string;
  ceuCredits: number;
  passedAt: Date;
  verificationCode: string;
};

const TEAL = rgb(0x16 / 255, 0x7a / 255, 0x72 / 255);
const SLATE = rgb(0x1f / 255, 0x29 / 255, 0x37 / 255);
const MUTED = rgb(0x6b / 255, 0x72 / 255, 0x80 / 255);

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Generate a single-page A4 landscape PDF certificate. Returns the
 * raw bytes so the caller can attach the right Content-Type header.
 */
export async function generateCertificatePdf(
  input: CertificateInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  // A4 landscape — 842 x 595 points
  const page = pdf.addPage([842, 595]);
  const { width, height } = page.getSize();

  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Border
  page.drawRectangle({
    x: 18,
    y: 18,
    width: width - 36,
    height: height - 36,
    borderColor: TEAL,
    borderWidth: 3,
  });

  // Brand
  page.drawText("SpecialCarer", {
    x: 48,
    y: height - 60,
    size: 18,
    font: helvBold,
    color: TEAL,
  });

  // Title
  const title = "Certificate of Completion";
  const titleSize = 28;
  const titleWidth = helvBold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: height - 140,
    size: titleSize,
    font: helvBold,
    color: SLATE,
  });

  // "is awarded to"
  const intro = "is awarded to";
  const introSize = 14;
  const introWidth = helv.widthOfTextAtSize(intro, introSize);
  page.drawText(intro, {
    x: (width - introWidth) / 2,
    y: height - 200,
    size: introSize,
    font: helv,
    color: MUTED,
  });

  // Carer name (truncate gracefully if very long)
  const name = (input.carerName || "Caregiver").slice(0, 64);
  const nameSize = 36;
  const nameWidth = helvBold.widthOfTextAtSize(name, nameSize);
  page.drawText(name, {
    x: Math.max(36, (width - nameWidth) / 2),
    y: height - 260,
    size: nameSize,
    font: helvBold,
    color: SLATE,
  });

  // Course
  const courseLine = `for completing "${input.courseTitle}"`;
  const courseSize = 16;
  const courseWidth = helv.widthOfTextAtSize(courseLine, courseSize);
  page.drawText(courseLine, {
    x: Math.max(36, (width - courseWidth) / 2),
    y: height - 320,
    size: courseSize,
    font: helv,
    color: SLATE,
  });

  // CEU + date
  const credits = `${input.ceuCredits.toFixed(2)} CEU / CPD credits`;
  const creditsSize = 14;
  const creditsWidth = helv.widthOfTextAtSize(credits, creditsSize);
  page.drawText(credits, {
    x: (width - creditsWidth) / 2,
    y: height - 360,
    size: creditsSize,
    font: helvBold,
    color: TEAL,
  });

  const dateLine = `Awarded ${fmtDate(input.passedAt)}`;
  const dateWidth = helv.widthOfTextAtSize(dateLine, creditsSize);
  page.drawText(dateLine, {
    x: (width - dateWidth) / 2,
    y: height - 390,
    size: creditsSize,
    font: helv,
    color: MUTED,
  });

  // Footer left
  const footerLeft =
    "All Care 4 U Group Ltd · Companies House 09428739 · SpecialCarer.com";
  page.drawText(footerLeft, {
    x: 48,
    y: 40,
    size: 9,
    font: helv,
    color: MUTED,
  });

  // Footer right
  const verifyLine = `Verification: ${input.verificationCode}`;
  const verifyUrl = `Verify at specialcarer.com/verify/${input.verificationCode}`;
  const verifySize = 9;
  const verifyW = helv.widthOfTextAtSize(verifyUrl, verifySize);
  page.drawText(verifyLine, {
    x: width - 48 - helvBold.widthOfTextAtSize(verifyLine, verifySize),
    y: 52,
    size: verifySize,
    font: helvBold,
    color: SLATE,
  });
  page.drawText(verifyUrl, {
    x: width - 48 - verifyW,
    y: 40,
    size: verifySize,
    font: helv,
    color: MUTED,
  });

  return pdf.save();
}
