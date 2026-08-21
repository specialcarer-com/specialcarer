-- Track whether a claimed refund is waiting on Stripe, database recovery, or
-- has reached a terminal state. The claim key is indexed for webhook recovery.

alter table public.bookings
  add column if not exists refund_status text;

alter table public.bookings
  drop constraint if exists bookings_refund_status_valid;

alter table public.bookings
  add constraint bookings_refund_status_valid
  check (
    refund_status is null
    or refund_status in (
      'pending_stripe',
      'pending_db_reconciliation',
      'completed',
      'failed_permanent'
    )
  ) not valid;

create index if not exists bookings_refund_request_key_idx
  on public.bookings (refund_request_key)
  where refund_request_key is not null;
