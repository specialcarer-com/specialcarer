-- Payment-capture crons claim work before calling Stripe. A stale claim is
-- intentionally recoverable after ten minutes by the route-level predicate.
alter table public.bookings
  add column if not exists processing_started_at timestamptz;

alter table public.payments
  add column if not exists processing_started_at timestamptz;

create index if not exists bookings_completed_payment_capture_claim_idx
  on public.bookings (payout_eligible_at, processing_started_at)
  where status = 'completed';

create index if not exists payments_capture_claim_idx
  on public.payments (created_at, processing_started_at)
  where status = 'requires_capture';
