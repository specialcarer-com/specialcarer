/**
 * UK (England & Wales) bank holidays for 2026 and 2027.
 *
 * Used by the monthly payroll cron to figure out the correct run date:
 *   target = 15th of the month
 *   if (target is a weekend OR a bank holiday) → step back to previous working day
 *
 * Source: gov.uk/bank-holidays — England and Wales calendar.
 * Format: ISO date "YYYY-MM-DD".
 */

export const UK_BANK_HOLIDAYS_ENGLAND_WALES: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", // New Year's Day
  "2026-04-03", // Good Friday
  "2026-04-06", // Easter Monday
  "2026-05-04", // Early May
  "2026-05-25", // Spring Bank Holiday
  "2026-08-31", // Summer Bank Holiday
  "2026-12-25", // Christmas Day
  "2026-12-28", // Boxing Day (substitute)
  // 2027
  "2027-01-01",
  "2027-03-26", // Good Friday
  "2027-03-29", // Easter Monday
  "2027-05-03",
  "2027-05-31",
  "2027-08-30",
  "2027-12-27", // Christmas Day substitute (25th = Saturday)
  "2027-12-28", // Boxing Day substitute (26th = Sunday)
]);

export function isUkBankHoliday(date: Date): boolean {
  return UK_BANK_HOLIDAYS_ENGLAND_WALES.has(toIsoDate(date));
}

export function isWeekend(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

export function isWorkingDay(date: Date): boolean {
  return !isWeekend(date) && !isUkBankHoliday(date);
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Return the date payroll should run for a given month — the 15th, unless
 * that's a weekend or bank holiday, in which case step back to the previous
 * working day.
 *
 * @param year e.g. 2026
 * @param month 1..12 (calendar month, NOT tax-period)
 */
export function getPayrollRunDate(year: number, month: number): Date {
  let d = new Date(Date.UTC(year, month - 1, 15));
  while (!isWorkingDay(d)) {
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1));
  }
  return d;
}

/**
 * Same as getPayrollRunDate but returns ISO date string.
 */
export function getPayrollRunDateIso(year: number, month: number): string {
  return toIsoDate(getPayrollRunDate(year, month));
}

/**
 * Compute the preview-open timestamp (72 hours before run @ 09:00 UTC).
 */
export function getPreviewOpenAt(runDate: Date): Date {
  const t = new Date(runDate);
  t.setUTCHours(9, 0, 0, 0);
  t.setUTCDate(t.getUTCDate() - 3);
  return t;
}

/**
 * Preview-close timestamp — midnight UTC the day before run.
 */
export function getPreviewCloseAt(runDate: Date): Date {
  const t = new Date(runDate);
  t.setUTCHours(0, 0, 0, 0);
  return t;
}
