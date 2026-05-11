/**
 * HMRC tax constants for PAYE/NI calculation. Versioned by tax year string
 * so we can carry historical values for re-runs or corrections after a
 * mid-year rate change.
 *
 * All values are in PENCE per ANNUM unless otherwise stated. Monthly
 * thresholds are derived as annual/12 in compute-pay.ts so the constants
 * here stay close to HMRC's published figures.
 *
 * Source: HMRC published rates and thresholds 2026-27.
 */

export type TaxYearRates = {
  taxYear: string; // e.g. "2026-27"
  defaultTaxCode: string;
  personalAllowanceCents: number; // annual
  basicRateLimitCents: number; // top of basic band (above PA)
  higherRateLimitCents: number; // top of higher band (above PA)
  // PAYE band rates (applied to taxable income = gross - allowance)
  basicRate: number; // 0.20
  higherRate: number; // 0.40
  additionalRate: number; // 0.45
  // NI thresholds (annual, GBP→pence)
  primaryThresholdCents: number; // PT — start of employee NI
  upperEarningsLimitCents: number; // UEL — top of 12% band
  secondaryThresholdCents: number; // ST — start of employer NI
  niEmployeeMainRate: number; // 0.12
  niEmployeeAddRate: number; // 0.02 above UEL
  niEmployerRate: number; // 0.15
  // Holiday accrual (Working Time Regs — 5.6 weeks / 46.4 weeks worked)
  holidayAccrualRate: number; // 0.1207
};

/**
 * 2026-27 tax year. Figures match HMRC announcement for 6 Apr 2026 → 5 Apr 2027.
 * PA: £12,570  Basic rate band: £37,700 (so basic ends at £50,270)
 * Higher rate up to £125,140 — above this is additional 45%.
 * NI: PT £12,570, UEL £50,270, ST £9,100.
 * Employee NI 12% PT→UEL, 2% above UEL.
 * Employer NI 15% above ST.
 */
export const TAX_YEAR_2026_27: TaxYearRates = {
  taxYear: "2026-27",
  defaultTaxCode: "1257L",
  personalAllowanceCents: 1_257_000, // £12,570
  basicRateLimitCents: 3_770_000, // £37,700 over PA
  higherRateLimitCents: 12_514_000 - 1_257_000, // £125,140 minus PA
  basicRate: 0.2,
  higherRate: 0.4,
  additionalRate: 0.45,
  primaryThresholdCents: 1_257_000, // £12,570 (aligned with PA)
  upperEarningsLimitCents: 5_027_000, // £50,270
  secondaryThresholdCents: 910_000, // £9,100
  niEmployeeMainRate: 0.12,
  niEmployeeAddRate: 0.02,
  niEmployerRate: 0.15,
  holidayAccrualRate: 0.1207,
};

const RATES_BY_YEAR: Record<string, TaxYearRates> = {
  "2026-27": TAX_YEAR_2026_27,
};

/**
 * Return the rate set for a given tax-year string. Falls back to the current
 * (2026-27) year if the requested year is unknown.
 */
export function getTaxYearRates(taxYear: string): TaxYearRates {
  return RATES_BY_YEAR[taxYear] ?? TAX_YEAR_2026_27;
}

/**
 * Given a calendar period_end date, return the UK tax year string the
 * period belongs to. UK tax year runs 6 April → 5 April.
 * e.g. period_end 2026-04-30 → "2026-27".
 */
export function taxYearForDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const startsThisYear = m > 4 || (m === 4 && day >= 6);
  const startYear = startsThisYear ? y : y - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
}

/**
 * Parse a tax code like "1257L", "1100L", "K475". Returns the
 * effective annual personal allowance (or negative for K codes) in pence.
 * Returns null if the code is unrecognised — caller should fall back to
 * the default allowance for that tax year.
 */
export function allowanceFromTaxCode(code: string): number | null {
  if (!code) return null;
  const m = /^([SC]?K?)(\d{2,5})([LMNT]?)$/i.exec(code.trim().toUpperCase());
  if (!m) return null;
  const prefix = m[1] ?? "";
  const digits = parseInt(m[2] ?? "0", 10);
  if (Number.isNaN(digits)) return null;
  // Tax code digits → £(digits×10) of allowance, in pence multiply by 100.
  // K prefix means the allowance is treated as additional taxable income.
  // e.g. "1257L" → £12,570 → 1,257,000 pence.
  if (prefix.endsWith("K")) return -digits * 1000; // negative in pence
  return digits * 1000;
}
