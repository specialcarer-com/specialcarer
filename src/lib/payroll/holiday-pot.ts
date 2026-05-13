/**
 * Phase 4 stage 1+2 — Holiday Pot ledger helpers.
 *
 * Pure functions extracted from run-engine so they can be unit-tested without
 * a Supabase client.
 *
 *   - computeHolidayLedgerEntry(): per confirmed payout, the accrual row.
 *   - computeHolidayDisbursementForCarer(): per payroll run + carer, decides
 *     which approved-and-unpaid leave requests pay out this run, which auto-
 *     reject (over-balance), and the total gross to add to the payslip.
 */

export type HolidayLedgerEntry = {
  carer_id: string;
  entry_type: "accrued" | "debited_paid_leave" | "adjusted" | "expired";
  amount_cents: number;
  payroll_run_id: string;
  org_carer_payout_id: string;
  notes: string;
};

export type ConfirmedPayoutForLedger = {
  id: string;
  carer_id: string;
  holiday_accrued_cents: number | null;
  run_id: string;
};

/**
 * Produce the holiday_pot_ledger row for a freshly confirmed payout. Returns
 * null when there is nothing to accrue (e.g. a zero-pay period) so the caller
 * can skip the insert.
 */
export function computeHolidayLedgerEntry(
  payout: ConfirmedPayoutForLedger,
): HolidayLedgerEntry | null {
  const accrued = payout.holiday_accrued_cents ?? 0;
  if (accrued <= 0) return null;
  return {
    carer_id: payout.carer_id,
    entry_type: "accrued",
    amount_cents: accrued,
    payroll_run_id: payout.run_id,
    org_carer_payout_id: payout.id,
    notes: `Auto-accrued from payslip ${payout.id}`,
  };
}

/* --------------------------- Phase 4 stage 2 ----------------------------- */

export type LeaveRequestForDisbursement = {
  id: string;
  requested_hours: number;
  requested_amount_cents: number;
  created_at: string;
};

export type DisbursementToPay = {
  request_id: string;
  amount_cents: number;
  hours: number;
};

export type DisbursementToReject = {
  request_id: string;
  reason: string;
};

export type DisbursementDecision = {
  total_payout_cents: number;
  total_payout_hours: number;
  to_pay: DisbursementToPay[];
  to_reject: DisbursementToReject[];
};

/**
 * Decide which approved + unpaid leave requests for a carer pay out in this
 * run. FIFO by created_at — earliest-submitted request paid first. Each
 * request must fit fully within the carer's *remaining* balance after prior
 * requests in this batch; if it doesn't fit it is auto-rejected (never
 * partially paid). The caller is responsible for actually performing the
 * payslip line, ledger insert, and request status update atomically.
 *
 * Pure: no I/O, no clock, no DB.
 */
export function computeHolidayDisbursementForCarer({
  requests,
  balanceCents,
}: {
  requests: LeaveRequestForDisbursement[];
  balanceCents: number;
}): DisbursementDecision {
  const decision: DisbursementDecision = {
    total_payout_cents: 0,
    total_payout_hours: 0,
    to_pay: [],
    to_reject: [],
  };

  // FIFO — earliest created_at first. Stable, deterministic.
  const sorted = [...requests].sort((a, b) => {
    if (a.created_at < b.created_at) return -1;
    if (a.created_at > b.created_at) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  let remaining = Math.max(0, balanceCents);
  for (const r of sorted) {
    const amount = r.requested_amount_cents;
    if (amount <= 0) {
      decision.to_reject.push({
        request_id: r.id,
        reason: "Insufficient balance at payroll time",
      });
      continue;
    }
    if (amount <= remaining) {
      decision.to_pay.push({
        request_id: r.id,
        amount_cents: amount,
        hours: Number(r.requested_hours) || 0,
      });
      decision.total_payout_cents += amount;
      decision.total_payout_hours += Number(r.requested_hours) || 0;
      remaining -= amount;
    } else {
      decision.to_reject.push({
        request_id: r.id,
        reason: "Insufficient balance at payroll time",
      });
    }
  }

  return decision;
}
