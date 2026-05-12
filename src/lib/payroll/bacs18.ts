/**
 * BACS Standard 18 Direct Credit file generator.
 *
 * Output is a fixed-width text file with CRLF line endings, exactly
 * 106 characters per line. The brief from the parent agent specifies a
 * uniform 106-char line length for every record; the Bacs spec describes
 * 80-char labels + 100-char data records under SPD. We surface the
 * divergence in `warnings[]` so it isn't silent.
 *
 * Record order (one of each label, N+1 data records):
 *
 *   VOL1                                       (volume label, 80 → 106 padded)
 *   HDR1                                       (data set header, 80 → 106 padded)
 *   UHL1                                       (user header, 80 → 106 padded)
 *   one Type-99 standard credit per payment    (100 → 106 padded)
 *   one contra record                          (100 → 106 padded, txn code 17)
 *   UTL1                                       (user trailer, 80 → 106 padded)
 *   EOF1                                       (data set trailer, 80 → 106 padded)
 *   EOV1                                       (end of volume, 80 → 106 padded)
 *
 * The function is pure: no DB reads, no env reads, no I/O. The route
 * handler at /api/admin/payroll/runs/[id]/bacs-export is responsible for
 * pulling the originator config from env and the payments from the
 * payroll run rows, then handing them to this generator.
 *
 * Validation lives in `bacs18-validate.ts`; call that first so the caller
 * can return a 422 with a list of fields before we ever build the file.
 */

import { validateBacs18Input } from "./bacs18-validate";

/** Standard 18 line width per the parent brief (uniform across all records). */
export const BACS18_LINE_WIDTH = 106;
export const BACS18_LINE_TERMINATOR = "\r\n";

export type Bacs18Originator = {
  /** 6-digit sort code. */
  sortCode: string;
  /** 8-digit account number. */
  accountNumber: string;
  /** Short legal name, <=18 chars, BACS character set (upper-cased internally). */
  name: string;
  /** 6-digit Service User Number from the bank. Required to produce a file. */
  sun: string;
};

export type Bacs18Submission = {
  /**
   * Serial number for this submission. Increments per file submitted
   * under the same SUN. The bank uses this to ensure ordering and
   * de-dup. Stored on `payroll_runs.bacs_serial_number`.
   */
  serialNumber: number;
  /** When the bank should process the payments (value date). */
  processingDate: Date;
  /** Reserved for future use. Defaults to GBP. */
  currencyCode?: "GBP";
  /**
   * Optional override for the file's creation date. The route handler
   * leaves this unset (defaults to now); tests pin it for deterministic
   * snapshot assertions.
   */
  creationDate?: Date;
  /**
   * Optional override for the HDR1 expiration date. Defaults to
   * creationDate + 6 months when omitted.
   */
  expirationDate?: Date;
};

export type Bacs18Payment = {
  payeeSortCode: string;
  payeeAccountNumber: string;
  payeeName: string;
  amountPence: number;
  reference: string;
  /** Standard credit. We don't currently emit any other transaction code. */
  transactionCode: "99";
};

export type Bacs18Input = {
  originator: Bacs18Originator;
  submission: Bacs18Submission;
  payments: Bacs18Payment[];
};

export type Bacs18Result = {
  /** Empty string when there's an error. */
  content: string;
  /** Non-fatal advisories the caller may want to surface or log. */
  warnings: string[];
  /** Null on success, otherwise a short reason. */
  error: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pad `s` to exactly `width` with `pad` on the right (or truncate). Strict —
 * throws if it would produce something other than the requested width.
 */
function padRight(s: string, width: number, pad: string = " "): string {
  if (s.length === width) return s;
  if (s.length > width) return s.slice(0, width);
  return s + pad.repeat(width - s.length);
}

/**
 * Right-justify a number with leading zeros up to `width` characters.
 * Throws if the number doesn't fit — caller should validate amounts first.
 */
function padNumeric(n: number, width: number): string {
  const s = String(Math.trunc(n));
  if (s.length > width) {
    throw new Error(`number ${n} does not fit in ${width} digits`);
  }
  return s.padStart(width, "0");
}

/**
 * Sanitise a free-form text field for BACS:
 *   - upper-case ASCII
 *   - replace any character outside the BACS subset with a space
 *   - truncate to `max` chars
 *   - pad to `max` with spaces on the right
 */
function bacsText(input: string, max: number, allowSlash = false): string {
  const allowed = allowSlash
    ? /[A-Z0-9 .'\-/]/
    : /[A-Z0-9 .'\-]/;
  const upper = (input ?? "").toUpperCase();
  let out = "";
  for (const ch of upper) {
    out += allowed.test(ch) ? ch : " ";
  }
  return padRight(out.slice(0, max), max, " ");
}

/**
 * ` YYDDD` — space + 2-digit year + 3-digit day-of-year. This matches the
 * Bacs spec for date fields in HDR1 / UHL1. Day-of-year is 1-indexed.
 */
function bacsYYDDD(d: Date): string {
  const year = d.getUTCFullYear();
  const yy = String(year % 100).padStart(2, "0");
  // Day-of-year in UTC. Start of year via Date.UTC anchors to 1 Jan 00:00Z.
  const startMs = Date.UTC(year, 0, 1);
  const day = Math.floor((d.getTime() - startMs) / 86_400_000) + 1;
  const ddd = String(day).padStart(3, "0");
  return ` ${yy}${ddd}`;
}

/** Format the same Date as YYYYMMDD (used in the export filename, not the file). */
export function bacsFilenameDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Pad any record up to BACS18_LINE_WIDTH with trailing spaces. */
function lineOf(body: string): string {
  if (body.length > BACS18_LINE_WIDTH) {
    throw new Error(
      `record body ${body.length} chars exceeds line width ${BACS18_LINE_WIDTH}`,
    );
  }
  return padRight(body, BACS18_LINE_WIDTH, " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Record builders
//
// Each builder returns the 80- or 100-char "canonical" record body; the
// caller wraps with `lineOf()` to pad to BACS18_LINE_WIDTH. Field positions
// inside the body match the tables in /home/user/workspace/phase4-spec.md
// (1-indexed in the spec, 0-indexed when we slice strings).
// ─────────────────────────────────────────────────────────────────────────────

function buildVol1(originatorSun: string, serial: number): string {
  // Spec: 80 chars.
  // 1–3: VOL ; 4: 1 ; 5–10: serial (6 digits, day-of-year+counter or generic
  // monotonic — we use raw serial right-justified) ; 11: space ; 12–31:
  // reserved spaces ; 32–37: reserved spaces ; 38–51: owner ID (SUN
  // left-justified, space-padded to 14) ; 52–79: reserved spaces ; 80: "1".
  const serialStr = padNumeric(serial % 1_000_000, 6);
  const ownerId = padRight(originatorSun, 14, " "); // SUN left-justified in 14
  const reserved20 = " ".repeat(20);
  const reserved6 = " ".repeat(6);
  const reserved28 = " ".repeat(28);
  const body =
    "VOL" + "1" + serialStr + " " + reserved20 + reserved6 + ownerId +
    reserved28 + "1";
  if (body.length !== 80) {
    throw new Error(`VOL1 length ${body.length} != 80`);
  }
  return body;
}

function buildHdr1(args: {
  sun: string;
  serial: number;
  creationDate: Date;
  expirationDate: Date;
}): string {
  // Spec: 80 chars.
  // 1–3: HDR ; 4: 1 ; 5–21: file identifier 17 chars
  //   The spec table is internally inconsistent (counts to 18); the most
  //   common BACS18 reading is: "A" + SUN(6) + "S" + 2 spaces + " " + SUN(6)
  //   = 1+6+1+2+1+6 = 17.
  // 22–27: set identification = VOL1 serial (6 digits)
  // 28–31: file section "0001" ; 32–35: file sequence "0001"
  // 36–39: generation "    " (blank) ; 40–41: gen version "  " (blank)
  // 42–47: creation " YYDDD" ; 48–53: expiration " YYDDD"
  // 54: accessibility space ; 55–60: block count "000000"
  // 61–73: system code 13 spaces ; 74–80: reserved 7 spaces
  const fileIdentifier =
    "A" + args.sun + "S" + "  " + " " + args.sun; // 1+6+1+2+1+6 = 17
  if (fileIdentifier.length !== 17) {
    throw new Error(`file identifier length ${fileIdentifier.length} != 17`);
  }
  const serialStr = padNumeric(args.serial % 1_000_000, 6);
  const body =
    "HDR" + "1" + fileIdentifier + serialStr + "0001" + "0001" +
    "    " + "  " + bacsYYDDD(args.creationDate) + bacsYYDDD(args.expirationDate) +
    " " + "000000" + " ".repeat(13) + " ".repeat(7);
  if (body.length !== 80) {
    throw new Error(`HDR1 length ${body.length} != 80`);
  }
  return body;
}

function buildUhl1(args: {
  processingDate: Date;
  fileNumber: number;
}): string {
  // Spec: 80 chars.
  // 1–3: UHL ; 4: 1 ; 5–10: processing day " YYDDD"
  // 11–20: receiving party "999999    "
  // 21–22: currency "00" ; 23–28: country (spaces)
  // 29–37: work code "1 DAILY  " (SPD)
  // 38–40: file number (3 digits)
  // 41–47: reserved (7 spaces)
  // 48–54: audit print id (7 spaces)
  // 55–80: service user (26 spaces)
  const fileNum = padNumeric(args.fileNumber, 3);
  const body =
    "UHL" + "1" + bacsYYDDD(args.processingDate) +
    "999999    " + "00" + " ".repeat(6) + "1 DAILY  " +
    fileNum + " ".repeat(7) + " ".repeat(7) + " ".repeat(26);
  if (body.length !== 80) {
    throw new Error(`UHL1 length ${body.length} != 80`);
  }
  return body;
}

function buildPayment(args: {
  payeeSortCode: string;
  payeeAccountNumber: string;
  payeeName: string;
  amountPence: number;
  reference: string;
  originatorSortCode: string;
  originatorAccount: string;
  originatorName: string;
}): string {
  // Spec: 100 chars.
  // 1–6: dest sort code ; 7–14: dest acct ; 15: account type "0"
  // 16–17: txn code "99" ; 18–23: orig sort ; 24–31: orig acct
  // 32–35: free format spaces ; 36–46: amount pence (11 digits)
  // 47–64: originator name (18) ; 65–82: reference (18)
  // 83–100: destination name (18)
  const amount = padNumeric(args.amountPence, 11);
  const body =
    args.payeeSortCode + args.payeeAccountNumber + "0" + "99" +
    args.originatorSortCode + args.originatorAccount + " ".repeat(4) +
    amount + bacsText(args.originatorName, 18) + bacsText(args.reference, 18, true) +
    bacsText(args.payeeName, 18);
  if (body.length !== 100) {
    throw new Error(`payment record length ${body.length} != 100`);
  }
  return body;
}

function buildContra(args: {
  originatorSortCode: string;
  originatorAccount: string;
  totalPence: number;
  processingDate: Date;
  originatorName: string;
}): string {
  // Spec: 100 chars. Same layout as payment except:
  //  - dest sort/account = originator sort/account
  //  - txn code 17 (debit contra)
  //  - amount = grand total
  //  - field 9 narrative = "PAYROLL " + YYYYMMDD (padded to 18)
  //  - field 10 = "CONTRA            "
  //  - field 11 = originator name (abbreviated)
  const amount = padNumeric(args.totalPence, 11);
  const narrative = bacsText(
    "PAYROLL " + bacsFilenameDate(args.processingDate),
    18,
  );
  const contraTag = bacsText("CONTRA", 18);
  const body =
    args.originatorSortCode + args.originatorAccount + "0" + "17" +
    args.originatorSortCode + args.originatorAccount + " ".repeat(4) +
    amount + narrative + contraTag + bacsText(args.originatorName, 18);
  if (body.length !== 100) {
    throw new Error(`contra record length ${body.length} != 100`);
  }
  return body;
}

function buildUtl1(args: {
  totalPence: number;
  paymentCount: number;
  contraCount: number;
}): string {
  // Spec: 80 chars.
  // 1–3: UTL ; 4: 1 ; 5–17: debit total (13 digits)
  // 18–30: credit total (13 digits) ; 31–37: debit count (7 digits)
  // 38–44: credit count (7 digits) ; 45–54: reserved 10 spaces
  // 55–80: service user 26 spaces
  const debitTotal = padNumeric(args.totalPence, 13);
  const creditTotal = padNumeric(args.totalPence, 13);
  const debitCount = padNumeric(args.contraCount, 7);
  const creditCount = padNumeric(args.paymentCount, 7);
  const body =
    "UTL" + "1" + debitTotal + creditTotal + debitCount + creditCount +
    " ".repeat(10) + " ".repeat(26);
  if (body.length !== 80) {
    throw new Error(`UTL1 length ${body.length} != 80`);
  }
  return body;
}

function buildEof1(args: {
  sun: string;
  serial: number;
  creationDate: Date;
  expirationDate: Date;
}): string {
  // Spec: identical to HDR1 layout except positions 1–4 = "EOF1".
  // Easiest: rebuild via HDR1 then overwrite the leading 4 chars.
  const hdr = buildHdr1(args);
  return "EOF1" + hdr.slice(4);
}

function buildEov1(args: {
  sun: string;
  serial: number;
}): string {
  // The brief asks for a separate "EOV1 (end of volume)" record after
  // EOF1. The Bacs spec for Standard 18 uses VOL1 only as the volume
  // opener and does not mandate an EOV1 record. We honour the brief by
  // mirroring VOL1's layout with "EOV1" in positions 1–4 so the
  // bank-side parser can match the symmetry. This is the most common
  // interpretation in vendor toolchains that emit EOV1.
  const vol = buildVol1(args.sun, args.serial);
  return "EOV1" + vol.slice(4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────────

export function generateBacs18File(input: Bacs18Input): Bacs18Result {
  const warnings: string[] = [];

  // Step 1: validate.
  const v = validateBacs18Input(input);
  if (!v.ok) {
    return {
      content: "",
      warnings,
      error: "Validation failed: " + v.errors.join("; "),
    };
  }

  const { originator, submission, payments } = input;

  // Spec-divergence warnings — surfaced once per file. Both items below
  // were ambiguous in /home/user/workspace/phase4-spec.md; resolutions are
  // documented so the parent agent can review them after the Lloyds
  // penny test runs.
  warnings.push(
    "Line width forced to 106 chars per parent brief; Bacs SPD spec is 80/100. " +
    "Bank may require strict SPD (80/100) — confirm during Lloyds penny test.",
  );
  warnings.push(
    "HDR1 file identifier built as A+SUN+S+'  '+' '+SUN (17 chars). " +
    "The spec table sums to 18; we picked the most common 17-char reading.",
  );

  // Step 2: derive dates.
  const creationDate = submission.creationDate ?? new Date();
  // Expiration date: 6 months from creation, per common convention.
  const expirationDate = submission.expirationDate ?? new Date(
    Date.UTC(
      creationDate.getUTCFullYear(),
      creationDate.getUTCMonth() + 6,
      creationDate.getUTCDate(),
    ),
  );

  // Step 3: build records.
  const records: string[] = [];

  records.push(lineOf(buildVol1(originator.sun, submission.serialNumber)));
  records.push(
    lineOf(
      buildHdr1({
        sun: originator.sun,
        serial: submission.serialNumber,
        creationDate,
        expirationDate,
      }),
    ),
  );
  records.push(
    lineOf(
      buildUhl1({
        processingDate: submission.processingDate,
        fileNumber: 1,
      }),
    ),
  );

  let totalPence = 0;
  for (const p of payments) {
    totalPence += p.amountPence;
    records.push(
      lineOf(
        buildPayment({
          payeeSortCode: p.payeeSortCode,
          payeeAccountNumber: p.payeeAccountNumber,
          payeeName: p.payeeName,
          amountPence: p.amountPence,
          reference: p.reference,
          originatorSortCode: originator.sortCode,
          originatorAccount: originator.accountNumber,
          originatorName: originator.name,
        }),
      ),
    );
  }

  records.push(
    lineOf(
      buildContra({
        originatorSortCode: originator.sortCode,
        originatorAccount: originator.accountNumber,
        totalPence,
        processingDate: submission.processingDate,
        originatorName: originator.name,
      }),
    ),
  );
  records.push(
    lineOf(
      buildUtl1({
        totalPence,
        paymentCount: payments.length,
        contraCount: 1,
      }),
    ),
  );
  records.push(
    lineOf(
      buildEof1({
        sun: originator.sun,
        serial: submission.serialNumber,
        creationDate,
        expirationDate,
      }),
    ),
  );
  records.push(lineOf(buildEov1({ sun: originator.sun, serial: submission.serialNumber })));

  // Step 4: assert post-conditions.
  for (let i = 0; i < records.length; i++) {
    if (records[i].length !== BACS18_LINE_WIDTH) {
      return {
        content: "",
        warnings,
        error: `internal: record ${i} length ${records[i].length} != ${BACS18_LINE_WIDTH}`,
      };
    }
  }

  return {
    content: records.join(BACS18_LINE_TERMINATOR) + BACS18_LINE_TERMINATOR,
    warnings,
    error: null,
  };
}
