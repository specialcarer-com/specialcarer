/**
 * Phase 4 stage 1 — Holiday Pot Ledger helpers.
 *
 * Pure functions extracted from run-engine so they can be unit-tested without
 * a Supabase client. The engine calls computeHolidayLedgerEntry() once per
 * confirmed payout to produce the row to insert into holiday_pot_ledger.
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
