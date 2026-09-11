-- ============================================================================
-- SpecialCarer — B3 / Stripe Connect readiness gate
--
-- Adds the fields the readiness gate (src/lib/stripe/connect-readiness.ts)
-- needs beyond the two boolean flags we already track:
--
--   * capabilities        — the raw Stripe capabilities object. We consult
--                           capabilities.transfers.status specifically. Storing
--                           the whole blob is cheaper than tracking N columns
--                           and keeps the door open for card_payments and
--                           other capabilities without another migration.
--   * disabled_reason     — the top-level Stripe reason (`requirements.past_due`,
--                           `rejected.other`, etc). Surfaced on the admin
--                           dashboard and captured in booking-intent 409s.
--   * last_refreshed_at   — when the row was last confirmed against live
--                           Stripe. The webhook stamps this on every
--                           account.updated / capability.updated event; the
--                           readiness gate stamps it after an active
--                           refresh. Distinct from `updated_at`, which the
--                           trigger touches on any write.
--
-- Trigger note: `updated_at` continues to auto-bump via the pre-existing
-- `set_updated_at()` trigger on any row write, so we deliberately do NOT
-- reuse it as the freshness marker — a background column-only tickle would
-- confuse cache logic. `last_refreshed_at` is the freshness signal; only
-- code paths that have actually confirmed the account against Stripe write it.
--
-- Freeze-respectful: additive, idempotent, no policy changes, no data backfill
-- required. Existing rows get NULL for the new columns; the readiness gate
-- treats NULL last_refreshed_at as "never refreshed" and forces a live read.
-- ============================================================================

alter table public.caregiver_stripe_accounts
  add column if not exists capabilities jsonb not null default '{}'::jsonb;

alter table public.caregiver_stripe_accounts
  add column if not exists disabled_reason text;

alter table public.caregiver_stripe_accounts
  add column if not exists last_refreshed_at timestamptz;

comment on column public.caregiver_stripe_accounts.capabilities is
  'Raw Stripe Account.capabilities object. Readiness gate reads capabilities.transfers.status. Written by account.updated and capability.updated webhooks.';
comment on column public.caregiver_stripe_accounts.disabled_reason is
  'Stripe Account.requirements.disabled_reason at last refresh. NULL when the account is healthy.';
comment on column public.caregiver_stripe_accounts.last_refreshed_at is
  'When this row was last confirmed against live Stripe (webhook or on-demand). Distinct from updated_at (any write). NULL forces the readiness gate to refresh.';
