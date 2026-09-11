-- ============================================================================
-- Stripe webhook retry state
-- ----------------------------------------------------------------------------
-- Prior state:
--   `stripe_webhook_events` was inserted at CLAIM time and updated with either
--   `processed_at` on success or `error` on failure. The idempotency guard in
--   the route treated any pre-existing row as "already owned" and returned
--   { received: true, idempotent: true } to Stripe. That meant a handler crash
--   left an unprocessed row on disk AND told Stripe's retry to stand down —
--   the failed event was silently orphaned.
--
-- This migration:
--   1. Adds `attempt_count` so the route/cron can bound retry attempts and
--      the admin view can surface stuck deliveries.
--   2. Adds `last_attempt_at` so we can throttle the recovery cron and expose
--      the true age of a failed delivery.
--   3. Adds an index that supports the recovery cron's hot path.
--
-- The route change and recovery cron ship in the same PR; both tolerate the
-- columns being absent (the cron is a no-op until this migration is applied,
-- and the route treats missing columns as attempt_count=0).
-- ============================================================================

alter table public.stripe_webhook_events
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz;

-- Recovery cron hot path: unprocessed rows with an error, ordered by age.
-- Partial index keeps it tiny — the vast majority of rows are processed_at
-- NOT NULL and never selected here.
create index if not exists stripe_webhook_events_retryable_idx
  on public.stripe_webhook_events (created_at)
  where processed_at is null and error is not null;

comment on column public.stripe_webhook_events.attempt_count is
  'Total handler attempts. Recovery cron increments on every retry. Bounded to protect from a poison event running unbounded.';
comment on column public.stripe_webhook_events.last_attempt_at is
  'Wall-clock of the most recent handler attempt. Used by the recovery cron to throttle retries and by the admin view to surface stuck deliveries.';
