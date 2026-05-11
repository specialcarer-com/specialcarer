/**
 * Pure functions to compute PAYE/NI/holiday breakdown from a carer's gross pay.
 *
 * Cumulative basis (not the simpler "Month 1" basis) — we use the YTD
 * pay-to-date so that PAYE is correctly smoothed across the tax year. This
 * matches how HMRC expects RTI submissions for monthly-paid workers.
 *
 * All cash values are integer PENCE. Hours are decimal.
 *
 * Caller is responsible for figuring out gross pay from approved timesheet
 * hours × booking rate. This module does not look up rates.
 */

import {
  allowanceFromTaxCode,
  getTaxYearRates,
  type TaxYearRates,
} from "./tax-constants";

export type ComputePayInput = {
  // The carer's gross pay for THIS period in pence (sum of approved hours × rates).
  gross_cents: number;
  // YTD gross pay BEFORE this period in pence (0 if first period of tax year).
  ytd_gross_cents: number;
  // YTD PAYE deducted BEFORE this period in pence (0 if first period).
  ytd_paye_cents: number;
  // Tax year string e.g. "2026-27"
  tax_year: string;
  // HMRC tax code, e.g. "1257L". Falls back to default for the year.
  tax_code?: string | null;
  // 1..12 — month within the tax year (April=1). Used to prorate the
  // cumulative allowance / band thresholds.
  tax_period: number;
};

export type ComputePayOutput = {
  gross_cents: number;
  paye_cents: number;
  ni_employee_cents: number;
  ni_employer_cents: number;
  holiday_accrued_cents: number;
  net_cents: number;
  effective_tax_code: string;
};

/**
 * Round to integer pence using banker's-style half-up. PAYE/NI rounding in
 * HMRC's PAYE calculation is normally rounded DOWN for PAYE deductions and
 * UP for refunds, but for our purposes — a private-sector employer keeping
 * to-the-penny ledgers — standard half-up rounding is acceptable and easy
 * to reconcile.
 */
function r(p: number): number {
  return Math.round(p);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Cumulative PAYE on YTD taxable pay, using the band structure for the year.
 * Returns total tax that should have been deducted YTD.
 */
function cumulativePaye(
  cumulativeTaxablePence: number,
  rates: TaxYearRates,
): number {
  if (cumulativeTaxablePence <= 0) return 0;
  let remaining = cumulativeTaxablePence;
  let tax = 0;

  // Basic band: 0..basicRateLimit
  const basicSlice = clamp(remaining, 0, rates.basicRateLimitCents);
  tax += basicSlice * rates.basicRate;
  remaining -= basicSlice;
  if (remaining <= 0) return tax;

  // Higher band: basicRateLimit..higherRateLimit
  const higherSlice = clamp(remaining, 0, rates.higherRateLimitCents - rates.basicRateLimitCents);
  tax += higherSlice * rates.higherRate;
  remaining -= higherSlice;
  if (remaining <= 0) return tax;

  // Additional: above higherRateLimit
  tax += remaining * rates.additionalRate;
  return tax;
}

/**
 * Employee NI is calculated on the THIS-PERIOD gross (NI is non-cumulative).
 */
function periodNiEmployee(grossPence: number, rates: TaxYearRates): number {
  // Monthly thresholds = annual / 12
  const ptMonthly = rates.primaryThresholdCents / 12;
  const uelMonthly = rates.upperEarningsLimitCents / 12;

  if (grossPence <= ptMonthly) return 0;
  const mainSlice = clamp(grossPence - ptMonthly, 0, uelMonthly - ptMonthly);
  const addSlice = Math.max(0, grossPence - uelMonthly);
  return mainSlice * rates.niEmployeeMainRate + addSlice * rates.niEmployeeAddRate;
}

function periodNiEmployer(grossPence: number, rates: TaxYearRates): number {
  const stMonthly = rates.secondaryThresholdCents / 12;
  if (grossPence <= stMonthly) return 0;
  return (grossPence - stMonthly) * rates.niEmployerRate;
}

export function computePay(input: ComputePayInput): ComputePayOutput {
  const rates = getTaxYearRates(input.tax_year);
  const effectiveCode = input.tax_code?.trim() || rates.defaultTaxCode;

  // Determine annual allowance from tax code, then prorate for tax_period.
  const annualAllowance =
    allowanceFromTaxCode(effectiveCode) ?? rates.personalAllowanceCents;
  const period = clamp(input.tax_period, 1, 12);
  const cumulativeAllowance = (annualAllowance * period) / 12;

  // YTD-INCLUSIVE values
  const ytdGrossInc = input.ytd_gross_cents + input.gross_cents;
  // Taxable pay = max(0, ytd gross - cumulative allowance). For K codes the
  // allowance is negative, increasing taxable pay.
  const cumulativeTaxable = Math.max(0, ytdGrossInc - cumulativeAllowance);

  // Cumulative band thresholds also prorate
  const periodRates: TaxYearRates = {
    ...rates,
    basicRateLimitCents: (rates.basicRateLimitCents * period) / 12,
    higherRateLimitCents: (rates.higherRateLimitCents * period) / 12,
  };

  const cumulativeTax = cumulativePaye(cumulativeTaxable, periodRates);
  const periodPayeRaw = cumulativeTax - input.ytd_paye_cents;
  // Floor at 0 — never refund PAYE within payroll; that goes through HMRC.
  const payeCents = r(Math.max(0, periodPayeRaw));

  const niEmployee = r(periodNiEmployee(input.gross_cents, rates));
  const niEmployer = r(periodNiEmployer(input.gross_cents, rates));
  const holiday = r(input.gross_cents * rates.holidayAccrualRate);
  const net = input.gross_cents - payeCents - niEmployee - holiday;

  return {
    gross_cents: input.gross_cents,
    paye_cents: payeCents,
    ni_employee_cents: niEmployee,
    ni_employer_cents: niEmployer,
    holiday_accrued_cents: holiday,
    net_cents: net,
    effective_tax_code: effectiveCode,
  };
}

/**
 * Given a UK tax year (start month = April) and a calendar Date that
 * represents the period_end of the payroll month, return 1..12 (the tax
 * period number). e.g. period_end = 30 Apr 2026 → period 1.
 */
export function taxPeriodForDate(d: Date): number {
  const m = d.getUTCMonth() + 1; // 1..12
  // April = 1, May = 2, ... March = 12.
  return ((m - 4 + 12) % 12) + 1;
}
