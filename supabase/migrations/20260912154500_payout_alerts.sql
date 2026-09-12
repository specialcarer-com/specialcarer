-- ============================================================================
-- SpecialCarer — C4 / Failed-payout alerts + weekly monitoring digest
--
-- Phase C's C1 (PR #218) added the dispute case model and the
-- `bookings.carer_payout_hold_reason` column so payouts can be held
-- while a dispute is under review. What's still missing is the alerting
-- surface: when a Stripe payout fails, is canceled, or is held for any
-- reason, we have nowhere to record that as a first-class carer-visible
-- event. A carer can silently miss a week's pay before anyone notices.
--
-- This migration adds:
--   1. `payout_alerts` — one row per (stripe_payout_id, alert_type)
--      when there is a stripe_payout_id, or per (carer, booking, reason)
--      when it's a hold that doesn't have a Stripe payout id yet. The
--      unique index on (stripe_payout_id, alert_type) — partial WHERE
--      stripe_payout_id IS NOT NULL — is what makes duplicate webhook
--      delivery a no-op.
--
-- Freeze-respectful: additive only. No touch of existing rows. No
-- indexes on existing tables that would rewrite them. RLS is enabled
-- with zero policies (service-role only) — the same pattern used by
-- `stripe_dispute_cases` (PR #218) and `refund_ledger` (PR #207).
-- The `/m/earnings` banner reads via a server component using the
-- service-role admin client; the admin panel does the same.
--
-- Deploy-safe: the payout webhook handler tolerates this table being
-- absent (returns `{ok:true, skippedReason:"schema_not_ready"}`), and
-- the weekly digest cron does the same. So the PR can land before this
-- migration is applied; once the migration reaches prod (auto-applied
-- via .github/workflows/supabase-migrations.yml, gated by the
-- destructive-migration pre-flight from PR #220 — this migration is
-- additive only so passes cleanly), the handler starts recording
-- fresh, and Stripe will retry any events it 5xx'd during the window.
-- ============================================================================

-- ── 1. Alerts table ──────────────────────────────────────────────────────────

create table if not exists public.payout_alerts (
  id uuid primary key default gen_random_uuid(),

  -- The carer this alert belongs to. Not null — every alert is
  -- attributed to a carer. Resolved from the Stripe Connect account
  -- via caregiver_stripe_accounts.stripe_account_id → user_id.
  carer_id uuid not null references public.profiles(id) on delete cascade,

  -- Optional booking association. Held-payout alerts (dispute, dbs,
  -- other) point at the booking that triggered the hold. Failed/
  -- canceled Stripe payout alerts leave this null because a Stripe
  -- payout aggregates multiple booking earnings.
  booking_id uuid references public.bookings(id) on delete set null,

  -- Alert taxonomy. CHECK constraint matches the shape used by
  -- stripe_dispute_cases (PR #218) so baseline reconciliation matches
  -- by shape (either `alert_type IN (...)` or
  -- `alert_type = ANY (ARRAY[...])`).
  alert_type text not null
    check (alert_type in (
      'failed',        -- Stripe payout.failed
      'delayed',       -- Stripe payout delayed beyond expected window
      'held_dispute',  -- booking held via carer_payout_hold_reason='dispute_open'
      'held_dbs',      -- booking held pending DBS check refresh
      'held_other'     -- catch-all for future hold reasons
    )),

  -- Stripe payout id (po_xxx). Nullable because held-payout alerts
  -- can predate the Stripe payout being minted. When set, the unique
  -- index on (stripe_payout_id, alert_type) enforces idempotency.
  stripe_payout_id text,

  amount_cents integer,
  currency text not null default 'gbp',

  -- State machine. Enum-shape mirrors stripe_dispute_cases /
  -- dsar_requests. Kept intentionally small — the notified/
  -- acknowledged distinction lets the digest cron avoid re-sending
  -- alerts the carer already saw an in-app notification for.
  state text not null default 'new'
    check (state in (
      'new',           -- freshly inserted, no notifications sent yet
      'notified',      -- in-app + email dispatched
      'acknowledged',  -- carer opened the alert or dismissed it
      'resolved'       -- payout.paid arrived, or the hold cleared
    )),

  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  notes text
);

-- Idempotency: one alert per (Stripe payout id, alert_type). Partial
-- index so held-* rows (no stripe_payout_id) do not consume the
-- uniqueness slot — those are deduplicated at insert time by the
-- application layer using (carer_id, booking_id, alert_type).
create unique index if not exists payout_alerts_stripe_payout_type_idx
  on public.payout_alerts(stripe_payout_id, alert_type)
  where stripe_payout_id is not null;

-- Serve the /m/earnings banner query (open alerts for one carer,
-- newest first) and the admin aggregation query.
create index if not exists payout_alerts_carer_state_created_idx
  on public.payout_alerts(carer_id, state, created_at desc);

comment on table public.payout_alerts is
  'Carer-visible payout alerts: failed Stripe payouts, cancellations, and payout holds. One row per (stripe_payout_id, alert_type) when a Stripe payout id is present — the partial unique index makes duplicate webhook delivery a no-op.';
comment on column public.payout_alerts.alert_type is
  'failed / delayed → Stripe payout events. held_dispute / held_dbs / held_other → booking-level payout holds surfaced to the carer.';
comment on column public.payout_alerts.state is
  'new → freshly inserted. notified → in-app + email dispatched. acknowledged → carer engaged with the alert. resolved → payout.paid arrived or the hold cleared.';

-- ── 2. Row Level Security: service-role only ─────────────────────────────────

alter table public.payout_alerts enable row level security;

-- No policies granted to anon or authenticated. With RLS enabled and
-- no SELECT/INSERT/UPDATE/DELETE policies, PostgreSQL rejects every
-- non-superuser row access. Only the service-role key (used by the
-- webhook handler, the digest cron, the /m/earnings server component
-- reading the banner, and the admin panel) can read/write. Same
-- pattern as stripe_dispute_cases (PR #218) and refund_ledger
-- (PR #207).
