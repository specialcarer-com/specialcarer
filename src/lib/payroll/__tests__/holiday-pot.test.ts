/**
 * Unit tests for computeHolidayLedgerEntry — the pure helper extracted from
 * the payroll engine that maps a confirmed payout to a holiday_pot_ledger row.
 *
 * Pattern matches src/lib/payroll/__tests__/compute-pay.test.ts — no
 * external test runner, just `node:assert` + tsx. Run with:
 *   npx tsx src/lib/payroll/__tests__/holiday-pot.test.ts
 */

import { strict as assert } from "node:assert";
import { computeHolidayLedgerEntry } from "../holiday-pot";

type Test = { name: string; run: () => void };
const tests: Test[] = [];
const test = (name: string, run: () => void) => tests.push({ name, run });

test("returns null when holiday_accrued_cents is zero", () => {
  const entry = computeHolidayLedgerEntry({
    id: "payout-1",
    carer_id: "carer-1",
    holiday_accrued_cents: 0,
    run_id: "run-1",
  });
  assert.equal(entry, null);
});

test("returns null when holiday_accrued_cents is negative", () => {
  const entry = computeHolidayLedgerEntry({
    id: "payout-1",
    carer_id: "carer-1",
    holiday_accrued_cents: -100,
    run_id: "run-1",
  });
  assert.equal(entry, null);
});

test("returns null when holiday_accrued_cents is missing", () => {
  const entry = computeHolidayLedgerEntry({
    id: "payout-1",
    carer_id: "carer-1",
    holiday_accrued_cents: null,
    run_id: "run-1",
  });
  assert.equal(entry, null);
});

test("amount_cents matches payout.holiday_accrued_cents and is positive accrual", () => {
  const entry = computeHolidayLedgerEntry({
    id: "payout-1",
    carer_id: "carer-1",
    holiday_accrued_cents: 12_345,
    run_id: "run-1",
  });
  assert.ok(entry, "expected a ledger entry");
  assert.equal(entry.amount_cents, 12_345);
  assert.ok(entry.amount_cents > 0, "amount_cents must be positive for accrual");
  assert.equal(entry.entry_type, "accrued");
});

test("carries through payroll_run_id, org_carer_payout_id and carer_id", () => {
  const entry = computeHolidayLedgerEntry({
    id: "payout-xyz",
    carer_id: "carer-abc",
    holiday_accrued_cents: 999,
    run_id: "run-42",
  });
  assert.ok(entry);
  assert.equal(entry.carer_id, "carer-abc");
  assert.equal(entry.payroll_run_id, "run-42");
  assert.equal(entry.org_carer_payout_id, "payout-xyz");
  assert.match(entry.notes, /Auto-accrued from payslip payout-xyz/);
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
process.exit(fail === 0 ? 0 : 1);
