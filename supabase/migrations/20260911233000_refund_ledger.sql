-- ============================================================================
-- SpecialCarer — B4 / append-only refund ledger
--
-- A3 (Phase A) shipped the refund reconciler; today we still track the
-- refunded total as a single denormalised counter (bookings.refunded_amount_cents)
-- overwritten by whichever webhook lands last. That works for a full refund
-- but silently loses information when there are multiple partials, when a
-- refund fails, or when Stripe re-delivers the same event.
--
-- This migration adds an append-only ledger so:
--   * Two partials + eventual full refund can be reconstructed exactly.
--   * `charge.refund.updated` and `refund.failed` are first-class events
--     that don't overwrite prior state.
--   * Duplicate webhook delivery is a no-op by construction (unique index
--     on (stripe_refund_id, event_type)).
--   * The denormalised `bookings.refunded_amount_cents` becomes a cache
--     projected from the ledger, with disagreement surfaced as a
--     reconciler alert rather than a silent overwrite.
--
-- Freeze-respectful: new table only, additive, idempotent, no touch of
-- existing rows. RLS is admin-read only via the service role — no
-- anon/authenticated policy is granted, so seeker-facing surfaces stay
-- untouched.
-- ============================================================================

create table if not exists public.refund_ledger (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  stripe_refund_id text not null,                 -- re_xxx
  stripe_event_id text,                           -- evt_xxx that produced this row (for audit)
  event_type text not null,                       -- 'charge.refunded' | 'charge.refund.updated' | 'refund.failed'
  amount_cents integer not null,                  -- amount of THIS event (not cumulative)
  currency text not null,                         -- 'gbp' | 'usd'
  status text not null,                           -- Stripe refund status at event time: succeeded|failed|pending|canceled|requires_action
  reason text,                                    -- Stripe refund.reason or refund.failure_reason
  raw jsonb not null default '{}'::jsonb,         -- full event.data.object for audit
  created_at timestamptz not null default now(),
  -- Idempotency: the same Stripe refund_id can produce at most one row of
  -- each event_type. Re-delivery of an already-recorded event is a no-op
  -- via an insert-if-not-exists (ON CONFLICT) in the recording code.
  unique (stripe_refund_id, event_type)
);

create index if not exists refund_ledger_booking_idx
  on public.refund_ledger(booking_id, created_at);

create index if not exists refund_ledger_stripe_refund_idx
  on public.refund_ledger(stripe_refund_id);

comment on table public.refund_ledger is
  'Append-only ledger of refund lifecycle events from Stripe. Source of truth for total_refunded_cents; bookings.refunded_amount_cents is a cache projected from this table.';
comment on column public.refund_ledger.amount_cents is
  'Amount of THIS event (not cumulative). For refund.failed this is the failed refund''s amount (a claim, not a delta).';
comment on column public.refund_ledger.event_type is
  'One of: charge.refunded, charge.refund.updated, refund.failed. Combined with stripe_refund_id via a unique index to make replay a no-op.';

alter table public.refund_ledger enable row level security;

-- No policies granted to anon or authenticated. Only the service-role
-- key (used by admin routes and the webhook handler) can read/write.
-- Explicit deny-all is achieved simply by omitting policies while RLS
-- is enabled: PostgreSQL rejects every non-superuser row access.
