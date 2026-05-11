/**
 * Unit tests for compute-pay. Run with:
 *   npx tsx src/lib/payroll/__tests__/compute-pay.test.ts
 *
 * No external test runner — uses node:assert. Throws on failure with a
 * descriptive message; prints a green check otherwise.
 */

import { strict as assert } from "node:assert";
import { computePay, taxPeriodForDate } from "../compute-pay";
import { TAX_YEAR_2026_27, taxYearForDate } from "../tax-constants";

type Test = { name: string; run: () => void };

const tests: Test[] = [];
const test = (name: string, run: () => void) => tests.push({ name, run });

/**
 * Case 1: Under personal allowance — no PAYE, no NI (gross below monthly PT)
 * Monthly PA = 12,570/12 = £1,047.50. £900 gross.
 */
test("under personal allowance — no PAYE, no NI", () => {
  const out = computePay({
    gross_cents: 90_000, // £900
    ytd_gross_cents: 0,
    ytd_paye_cents: 0,
    tax_year: "2026-27",
    tax_code: "1257L",
    tax_period: 1,
  });
  assert.equal(out.paye_cents, 0, "expected zero PAYE under allowance");
  assert.equal(out.ni_employee_cents, 0, "expected zero employee NI under PT");
  // 12.07% of £900 = £108.63
  assert.equal(out.holiday_accrued_cents, 10_863, "holiday accrual mismatch");
  // Net = 900 - 0 - 0 - 108.63 = 791.37
  assert.equal(out.net_cents, 79_137, "net mismatch");
});

/**
 * Case 2: Into basic band — gross £2,000 in period 1.
 * Cumulative allowance period 1 = £12,570/12 = £1,047.50 → 104,750p
 * Taxable = 200,000 - 104,750 = 95,250p
 * Basic-band cumulative limit period 1 = 37,700/12 = £3,141.67 → 314,167p
 * PAYE = 95,250 * 0.20 = 19,050p (£190.50)
 */
test("into basic band — period 1, single month", () => {
  const out = computePay({
    gross_cents: 200_000,
    ytd_gross_cents: 0,
    ytd_paye_cents: 0,
    tax_year: "2026-27",
    tax_code: "1257L",
    tax_period: 1,
  });
  assert.equal(out.paye_cents, 19_050, "PAYE basic-band mismatch");
  // NI employee: monthly PT = £1,047.50; (200,000 - 104,750) = 95,250 * 0.12 = 11,430
  assert.equal(out.ni_employee_cents, 11_430, "NI employee basic-band mismatch");
  // NI employer: monthly ST = 910,000/12 = 75,833.33; (200,000-75,833.33) * 0.15 = 18,625
  assert.equal(out.ni_employer_cents, 18_625, "NI employer mismatch");
  assert.equal(out.holiday_accrued_cents, 24_140, "holiday mismatch");
});

/**
 * Case 3: Into higher band — single period with very high pay
 * gross £5,000 in period 1.
 * Cumulative allowance period 1 = 104,750p
 * Taxable = 500,000 - 104,750 = 395,250p
 * Basic cap period 1 = 314,167p → basic tax = 314,167 * 0.20 = 62,833p
 * Higher = (395,250 - 314,167) * 0.40 = 81,083 * 0.40 = 32,433p
 * Total = ~95,266p
 */
test("into higher band — period 1", () => {
  const out = computePay({
    gross_cents: 500_000,
    ytd_gross_cents: 0,
    ytd_paye_cents: 0,
    tax_year: "2026-27",
    tax_code: "1257L",
    tax_period: 1,
  });
  // Allow ±2p tolerance for rounding choices in the prorate.
  assert.ok(
    Math.abs(out.paye_cents - 95_267) <= 3,
    `PAYE higher-band off: expected ~95,267p got ${out.paye_cents}`,
  );
  // NI: monthly UEL = 50,270/12 = 418,917p; gross > UEL.
  // Main slice = UEL - PT = 418,917 - 104,750 = 314,167 * 0.12 = 37,700p
  // Add slice = 500,000 - 418,917 = 81,083 * 0.02 = 1,622p
  // Total ≈ 39,322p
  assert.ok(
    Math.abs(out.ni_employee_cents - 39_322) <= 3,
    `NI employee higher band off: got ${out.ni_employee_cents}`,
  );
});

/**
 * Case 4: NI threshold crossing — gross just above monthly PT.
 * Monthly PT = 104,750p. gross = 110,000p.
 * NI employee = (110,000 - 104,750) * 0.12 = 5,250 * 0.12 = 630p
 */
test("NI threshold crossing — just above PT", () => {
  const out = computePay({
    gross_cents: 110_000,
    ytd_gross_cents: 0,
    ytd_paye_cents: 0,
    tax_year: "2026-27",
    tax_code: "1257L",
    tax_period: 1,
  });
  assert.equal(out.ni_employee_cents, 630, "NI threshold crossing mismatch");
  // PAYE: taxable = 110,000 - 104,750 = 5,250 * 0.20 = 1,050
  assert.equal(out.paye_cents, 1_050, "PAYE just-over-allowance mismatch");
});

/**
 * Case 5: Holiday accrual exact — verifies the 12.07% rate.
 * gross = £1,000 → holiday = 120.70 = 12,070p
 */
test("holiday accrual 12.07% — exact", () => {
  const out = computePay({
    gross_cents: 100_000,
    ytd_gross_cents: 0,
    ytd_paye_cents: 0,
    tax_year: "2026-27",
    tax_code: "1257L",
    tax_period: 1,
  });
  assert.equal(out.holiday_accrued_cents, 12_070, "12.07% accrual exact");
});

/**
 * Case 6 (bonus): Cumulative — period 6 with consistent YTD.
 * 5 months at £2,000 each → YTD gross 1,000,000p. PAYE per the basic-band
 * calc above should converge so each month's PAYE is the same (~19,050p).
 * We check period 6 produces the expected per-period figure given correct YTD.
 */
test("cumulative — period 6 produces flat PAYE", () => {
  // Compute period 1 first to capture its PAYE.
  const p1 = computePay({
    gross_cents: 200_000,
    ytd_gross_cents: 0,
    ytd_paye_cents: 0,
    tax_year: "2026-27",
    tax_code: "1257L",
    tax_period: 1,
  });
  // YTD after 5 identical months
  const out = computePay({
    gross_cents: 200_000,
    ytd_gross_cents: p1.paye_cents > 0 ? 200_000 * 5 : 200_000 * 5,
    ytd_paye_cents: p1.paye_cents * 5,
    tax_year: "2026-27",
    tax_code: "1257L",
    tax_period: 6,
  });
  // Expected period PAYE ≈ p1 (should be the same — flat earnings).
  assert.ok(
    Math.abs(out.paye_cents - p1.paye_cents) <= 5,
    `cumulative PAYE not stable: p1=${p1.paye_cents} p6=${out.paye_cents}`,
  );
});

/**
 * Helper sanity tests — non-financial.
 */
test("taxYearForDate boundary 5 April vs 6 April", () => {
  assert.equal(taxYearForDate(new Date(Date.UTC(2026, 3, 5))), "2025-26");
  assert.equal(taxYearForDate(new Date(Date.UTC(2026, 3, 6))), "2026-27");
  assert.equal(taxYearForDate(new Date(Date.UTC(2027, 3, 5))), "2026-27");
});

test("taxPeriodForDate April → 1, March → 12", () => {
  assert.equal(taxPeriodForDate(new Date(Date.UTC(2026, 3, 30))), 1);
  assert.equal(taxPeriodForDate(new Date(Date.UTC(2027, 2, 31))), 12);
  assert.equal(taxPeriodForDate(new Date(Date.UTC(2026, 11, 1))), 9);
});

let pass = 0;
let fail = 0;
for (const t of tests) {
  try {
    t.run();
    console.log(`  PASS  ${t.name}`);
    pass++;
  } catch (e) {
    fail++;
    console.error(`  FAIL  ${t.name}`);
    console.error(e instanceof Error ? e.message : e);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
// Constant sanity check — silences "unused export" complaints.
void TAX_YEAR_2026_27;
process.exit(fail === 0 ? 0 : 1);
