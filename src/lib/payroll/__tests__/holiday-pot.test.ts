/**
 * Unit tests for the holiday-pot pure helpers.
 *
 *   - computeHolidayLedgerEntry — accrual row produced per confirmed payout
 *   - computeHolidayDisbursementForCarer — Phase 4 stage 2 disbursement
 *     decision for a carer's approved-and-unpaid leave requests
 *
 * Pattern matches src/lib/payroll/__tests__/compute-pay.test.ts — uses the
 * built-in node:test runner via `node --import tsx --test`.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  computeHolidayLedgerEntry,
  computeHolidayDisbursementForCarer,
  type LeaveRequestForDisbursement,
} from "../holiday-pot";

/* -------------------- computeHolidayLedgerEntry -------------------------- */

test("ledger: returns null when holiday_accrued_cents is zero", () => {
  const entry = computeHolidayLedgerEntry({
    id: "payout-1",
    carer_id: "carer-1",
    holiday_accrued_cents: 0,
    run_id: "run-1",
  });
  assert.equal(entry, null);
});

test("ledger: returns null when holiday_accrued_cents is negative", () => {
  const entry = computeHolidayLedgerEntry({
    id: "payout-1",
    carer_id: "carer-1",
    holiday_accrued_cents: -100,
    run_id: "run-1",
  });
  assert.equal(entry, null);
});

test("ledger: returns null when holiday_accrued_cents is missing", () => {
  const entry = computeHolidayLedgerEntry({
    id: "payout-1",
    carer_id: "carer-1",
    holiday_accrued_cents: null,
    run_id: "run-1",
  });
  assert.equal(entry, null);
});

test("ledger: amount_cents matches payout.holiday_accrued_cents and is positive accrual", () => {
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

test("ledger: carries through payroll_run_id, org_carer_payout_id and carer_id", () => {
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

/* -------------------- computeHolidayDisbursementForCarer ----------------- */

const req = (
  id: string,
  amount_cents: number,
  hours: number,
  created_at: string,
): LeaveRequestForDisbursement => ({
  id,
  requested_amount_cents: amount_cents,
  requested_hours: hours,
  created_at,
});

test("disbursement: empty request list yields zero payout, no actions", () => {
  const d = computeHolidayDisbursementForCarer({
    requests: [],
    balanceCents: 50_000,
  });
  assert.equal(d.total_payout_cents, 0);
  assert.equal(d.total_payout_hours, 0);
  assert.deepEqual(d.to_pay, []);
  assert.deepEqual(d.to_reject, []);
});

test("disbursement: single request fully within balance pays in full", () => {
  const d = computeHolidayDisbursementForCarer({
    requests: [req("r1", 20_000, 8, "2026-05-01T00:00:00Z")],
    balanceCents: 50_000,
  });
  assert.equal(d.total_payout_cents, 20_000);
  assert.equal(d.total_payout_hours, 8);
  assert.equal(d.to_pay.length, 1);
  assert.equal(d.to_pay[0]!.request_id, "r1");
  assert.equal(d.to_pay[0]!.amount_cents, 20_000);
  assert.equal(d.to_reject.length, 0);
});

test("disbursement: single request over balance is auto-rejected — never partially paid", () => {
  const d = computeHolidayDisbursementForCarer({
    requests: [req("r1", 60_000, 24, "2026-05-01T00:00:00Z")],
    balanceCents: 50_000,
  });
  assert.equal(d.total_payout_cents, 0);
  assert.equal(d.total_payout_hours, 0);
  assert.equal(d.to_pay.length, 0);
  assert.equal(d.to_reject.length, 1);
  assert.equal(d.to_reject[0]!.request_id, "r1");
  assert.match(d.to_reject[0]!.reason, /Insufficient balance/);
});

test("disbursement: multi-request FIFO — earlier requests paid first, later one rejected if no headroom", () => {
  const d = computeHolidayDisbursementForCarer({
    requests: [
      req("late", 20_000, 8, "2026-05-05T00:00:00Z"),
      req("early", 40_000, 16, "2026-05-01T00:00:00Z"),
    ],
    balanceCents: 50_000,
  });
  // Earliest first — "early" pays, "late" then exceeds remaining 10k and rejects.
  assert.equal(d.to_pay.length, 1);
  assert.equal(d.to_pay[0]!.request_id, "early");
  assert.equal(d.to_pay[0]!.amount_cents, 40_000);
  assert.equal(d.to_reject.length, 1);
  assert.equal(d.to_reject[0]!.request_id, "late");
  assert.equal(d.total_payout_cents, 40_000);
  assert.equal(d.total_payout_hours, 16);
});

test("disbursement: multi-request partial coverage — all that fit FIFO are paid, the rest rejected", () => {
  const d = computeHolidayDisbursementForCarer({
    requests: [
      req("a", 10_000, 4, "2026-05-01T00:00:00Z"),
      req("b", 10_000, 4, "2026-05-02T00:00:00Z"),
      req("c", 10_000, 4, "2026-05-03T00:00:00Z"),
      req("d", 10_000, 4, "2026-05-04T00:00:00Z"),
    ],
    balanceCents: 25_000,
  });
  assert.deepEqual(
    d.to_pay.map((p) => p.request_id),
    ["a", "b"],
  );
  // c is 10k but remaining after a+b is 5k → reject.
  // d is also 10k > 5k → reject.
  assert.deepEqual(
    d.to_reject.map((r) => r.request_id).sort(),
    ["c", "d"],
  );
  assert.equal(d.total_payout_cents, 20_000);
  assert.equal(d.total_payout_hours, 8);
});

test("disbursement: zero/negative amount request is auto-rejected", () => {
  const d = computeHolidayDisbursementForCarer({
    requests: [
      req("zero", 0, 0, "2026-05-01T00:00:00Z"),
      req("neg", -1_000, -1, "2026-05-02T00:00:00Z"),
      req("ok", 5_000, 2, "2026-05-03T00:00:00Z"),
    ],
    balanceCents: 10_000,
  });
  assert.equal(d.to_pay.length, 1);
  assert.equal(d.to_pay[0]!.request_id, "ok");
  assert.equal(d.to_reject.length, 2);
});

test("disbursement: zero balance rejects every request", () => {
  const d = computeHolidayDisbursementForCarer({
    requests: [
      req("a", 100, 1, "2026-05-01T00:00:00Z"),
      req("b", 200, 1, "2026-05-02T00:00:00Z"),
    ],
    balanceCents: 0,
  });
  assert.equal(d.to_pay.length, 0);
  assert.equal(d.to_reject.length, 2);
  assert.equal(d.total_payout_cents, 0);
});

test("disbursement: negative balance treated as zero — all rejected", () => {
  const d = computeHolidayDisbursementForCarer({
    requests: [req("a", 100, 1, "2026-05-01T00:00:00Z")],
    balanceCents: -500,
  });
  assert.equal(d.to_pay.length, 0);
  assert.equal(d.to_reject.length, 1);
});

test("disbursement: idempotency — same inputs produce identical decision (deterministic ordering, no clock)", () => {
  const requests = [
    req("a", 10_000, 4, "2026-05-01T00:00:00Z"),
    req("b", 10_000, 4, "2026-05-02T00:00:00Z"),
    req("c", 10_000, 4, "2026-05-03T00:00:00Z"),
  ];
  const d1 = computeHolidayDisbursementForCarer({ requests, balanceCents: 25_000 });
  const d2 = computeHolidayDisbursementForCarer({
    requests: [...requests].reverse(),
    balanceCents: 25_000,
  });
  assert.deepEqual(d1, d2);
  // And re-running the helper on the original list never double-counts —
  // the caller's idempotency contract is: only feed approved+unpaid into it.
  // The DB-level unique index on holiday_pot_ledger (leave_request_id)
  // WHERE entry_type='debited_paid_leave' is the safety net for that.
});

test("disbursement: created_at tiebreaker is stable on id", () => {
  const d = computeHolidayDisbursementForCarer({
    requests: [
      req("zzz", 10_000, 4, "2026-05-01T00:00:00Z"),
      req("aaa", 10_000, 4, "2026-05-01T00:00:00Z"),
    ],
    balanceCents: 10_000,
  });
  assert.equal(d.to_pay.length, 1);
  assert.equal(d.to_pay[0]!.request_id, "aaa", "id-lex tiebreak when created_at ties");
});
