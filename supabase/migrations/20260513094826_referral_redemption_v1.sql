-- 20260513_referral_redemption_v1 — Close the loop on the £20/£20 referral
-- programme: allow seekers to redeem accrued credit against a booking total
-- at checkout. Platform absorbs the discount; carer payout is computed on
-- `bookings.total_cents` which intentionally stays at the pre-credit value.
--
-- This migration is NOT applied by the bot. The parent agent runs it.

alter table public.bookings
  add column if not exists referral_credit_applied_cents integer not null default 0
    check (referral_credit_applied_cents >= 0),
  add column if not exists referral_credit_applied_at timestamptz;

create index if not exists idx_bookings_referral_credit_applied
  on public.bookings(referral_credit_applied_at)
  where referral_credit_applied_cents > 0;
