-- Phase 4 stage 2 — Holiday Pot Disbursement (UK).
--
-- Lets the monthly payroll engine pay out approved holiday-leave requests.
-- Strictly additive: new column on org_carer_payouts to snapshot the gross
-- holiday-payout amount included in this payslip, a sibling column to record
-- which leave requests it covers, and a partial unique index on the ledger
-- so a single leave request can never be debited twice.

-- 1. Snapshot columns on the payout row ------------------------------------
alter table public.org_carer_payouts
  add column if not exists holiday_payout_cents integer not null default 0;

alter table public.org_carer_payouts
  add column if not exists holiday_payout_request_ids uuid[] not null default '{}';

comment on column public.org_carer_payouts.holiday_payout_cents is
  'Phase 4 stage 2: gross holiday-pot payout included in this payslip in pence. Counts toward gross_pay_cents so PAYE/NI compute on it.';

comment on column public.org_carer_payouts.holiday_payout_request_ids is
  'Phase 4 stage 2: uuids of holiday_leave_requests rows that contributed to holiday_payout_cents on this payslip (FIFO by created_at).';

-- 2. Idempotency safety net for the disbursement ---------------------------
-- At most one debited_paid_leave entry per leave_request_id. The engine
-- already guards with status='approved' AND paid_at IS NULL, but a unique
-- index makes accidental double-runs impossible at the DB level.
create unique index if not exists holiday_pot_ledger_debited_leave_request_unique
  on public.holiday_pot_ledger (leave_request_id)
  where entry_type = 'debited_paid_leave';
