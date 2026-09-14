-- ============================================================================
-- SpecialCarer — E1: Refund reconciliation state machine + webhook state enum
--
-- Fully additive. No DROP, no TRUNCATE, no policy replacements — this
-- migration does NOT need a destructive-migrations opt-in trailer and MUST
-- NOT carry one. Applied automatically by
-- .github/workflows/supabase-migrations.yml on merge to main.
--
-- ---------------------------------------------------------------------------
-- What ships (in order):
--
--   1. NEW ENUM public.webhook_event_state
--      ('pending', 'processing', 'completed', 'failed'). Explicit state for
--      each stripe_webhook_events row. Closes the item-47 gap where a row
--      with (processed_at NOT NULL AND error NOT NULL) was ambiguous.
--
--   2. NEW ENUM public.refund_reconciliation_state
--      ('initiated', 'partial', 'fully_refunded', 'mismatch', 'reconciled').
--      Used by the new refund_reconciliation table below.
--
--   3. ALTER TABLE public.stripe_webhook_events
--        ADD COLUMN state webhook_event_state NOT NULL DEFAULT 'pending'
--
--      Backfilled in the SAME migration (43 rows in prod, small + safe):
--        * processed_at NOT NULL AND error IS NULL      → 'completed'
--        * processed_at IS NULL   AND error IS NOT NULL → 'failed'
--        * processed_at NOT NULL AND error IS NOT NULL  → 'failed'
--          (ambiguous rows resolved to failed so Stripe re-delivery
--           re-processes them cleanly; the pre-E1 handler wrote
--           processed_at first and error second, so an error stamp AFTER
--           processed_at means the effect side-crashed after the ack —
--           safer to re-run than to trust the ack.)
--        * everything else stays 'pending' (the column default).
--
--   4. Partial index stripe_webhook_events_state_pending_idx (created_at)
--      WHERE state = 'pending'. Mirrors the payments_capture_claim_idx
--      partial-index-as-work-queue pattern from PR #187 so the pending
--      state can be cheaply scanned by workers and dashboards.
--
--   5. NEW TABLE public.refund_reconciliation. State-machine layer sitting
--      ON TOP OF the append-only refund_ledger event log. Populated by the
--      new /api/cron/refund-reconciliation route (this PR). NOT extending
--      refund_ledger — that table's (stripe_refund_id, event_type) unique
--      index is a raw event log; adding derived state to it corrupts the
--      event-log semantics.
--
--   6. Three indexes on refund_reconciliation: booking_id, stripe PI id,
--      and a state_open partial index for the open-cases dashboard query.
--
--   7. NO RLS on refund_reconciliation. Service role writes from the cron;
--      any admin surface goes through a server route with an
--      is_admin(auth.uid()) gate (mirrors the refund_ledger / stripe_
--      webhook_events / admin_webhook_events pattern — none of them have
--      RLS either).
--
--   8. Table comment describing the machine and cron owner. Single-quoted,
--      no `||` inside the DDL literal (D5 §7.5 rule — the D5 rollback was
--      caused by exactly this class of concat-in-literal mistake).
--
-- ---------------------------------------------------------------------------
-- Verified against prod (project qupjaanyhnuvlexkwtpq) on 14 Sep 2026 via
-- the Supabase Management API using information_schema.columns +
-- pg_get_expr(polqual, polrelid):
--
--   * stripe_webhook_events columns: id (text pkey), type, payload,
--     processed_at, error, created_at, attempt_count, last_attempt_at.
--     43 rows in prod. NO existing 'state' column.
--   * stripe_webhook_events has NO RLS policies (service-role only) —
--     adding a column changes nothing on the access side.
--   * refund_ledger columns: id, booking_id, stripe_refund_id (with
--     stripe_event_id), event_type, amount_cents, currency, status,
--     reason, raw, created_at. UNIQUE (stripe_refund_id, event_type).
--     0 rows in prod today.
--   * payments columns: id, booking_id, stripe_payment_intent_id (UNIQUE),
--     stripe_charge_id, status (payment_status enum), amount_cents,
--     currency, ... The reconciliation cron joins refund_ledger.raw
--     (jsonb) → stripe_charge_id → payments.stripe_charge_id →
--     stripe_payment_intent_id + amount_cents.
--   * payments RLS: "admins read all payments" (is_admin(auth.uid())) and
--     "parties can read own payments" (EXISTS bookings b WHERE
--      b.id = payments.booking_id AND (auth.uid() = b.seeker_id OR
--      auth.uid() = b.caregiver_id)). E1's cron reads via service_role,
--     which bypasses RLS; the admin dashboard reads refund_reconciliation
--     directly (no join into payments needed for the counter view) and
--     goes through requireAdmin() which enforces is_admin server-side.
--   * bookings.id exists (uuid, referenced by refund_reconciliation.booking_id
--     FK below).
--   * No 'rm' / 'ni' role literals used. profiles.role is
--     seeker | caregiver | admin today. Admin surface uses is_admin() via
--     requireAdmin(). TODO(rm-ni-split): revisit once the RM/NI split
--     ships (mirrors D4/D5 pattern).
-- ---------------------------------------------------------------------------
-- Idempotency: this file uses CREATE TYPE ... (guarded with a DO block),
-- ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, CREATE INDEX IF
-- NOT EXISTS, and CREATE UNIQUE INDEX IF NOT EXISTS. The UPDATE backfill
-- is a WHERE-clause on the still-default 'pending' state (so a second
-- run against a scratch DB is a no-op — rows already in their target
-- state are not selected). Verified locally by replaying against a
-- scratch pg DB (see runbook / test file).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'webhook_event_state'
  ) THEN
    CREATE TYPE public.webhook_event_state AS ENUM (
      'pending',
      'processing',
      'completed',
      'failed'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'refund_reconciliation_state'
  ) THEN
    CREATE TYPE public.refund_reconciliation_state AS ENUM (
      'initiated',
      'partial',
      'fully_refunded',
      'mismatch',
      'reconciled'
    );
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2. Add explicit state column to stripe_webhook_events
-- ---------------------------------------------------------------------------

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS state public.webhook_event_state
    NOT NULL DEFAULT 'pending';

-- Backfill 43 existing rows from the implicit (processed_at, error) state
-- model. Guarded on state='pending' so a replay is a no-op.
UPDATE public.stripe_webhook_events
   SET state = 'completed'
 WHERE state = 'pending'
   AND processed_at IS NOT NULL
   AND error IS NULL;

UPDATE public.stripe_webhook_events
   SET state = 'failed'
 WHERE state = 'pending'
   AND processed_at IS NULL
   AND error IS NOT NULL;

-- Ambiguous rows (processed_at NOT NULL AND error NOT NULL) resolve to
-- 'failed'. The old handler wrote processed_at first, error second on the
-- crash path, so any row with both stamps means the effect side crashed
-- AFTER the ack — safer to re-drive than to trust the stale ack.
UPDATE public.stripe_webhook_events
   SET state = 'failed'
 WHERE state = 'pending'
   AND processed_at IS NOT NULL
   AND error IS NOT NULL;

-- Partial index mirrors payments_capture_claim_idx (created_at) style.
CREATE INDEX IF NOT EXISTS stripe_webhook_events_state_pending_idx
  ON public.stripe_webhook_events (created_at)
  WHERE state = 'pending';

-- ---------------------------------------------------------------------------
-- 3. New refund_reconciliation table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.refund_reconciliation (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                uuid NOT NULL
                              REFERENCES public.bookings(id),
  stripe_refund_id          text NOT NULL UNIQUE,
  stripe_payment_intent_id  text NOT NULL,
  expected_amount_cents     integer NOT NULL,
  observed_amount_cents     integer,
  currency                  text NOT NULL,
  state                     public.refund_reconciliation_state
                              NOT NULL DEFAULT 'initiated',
  initiated_at              timestamptz NOT NULL DEFAULT now(),
  reconciled_at             timestamptz,
  mismatch_reason           text,
  raw                       jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS refund_reconciliation_booking_idx
  ON public.refund_reconciliation (booking_id);

CREATE INDEX IF NOT EXISTS refund_reconciliation_pi_idx
  ON public.refund_reconciliation (stripe_payment_intent_id);

CREATE INDEX IF NOT EXISTS refund_reconciliation_state_open_idx
  ON public.refund_reconciliation (initiated_at DESC)
  WHERE state IN ('initiated', 'partial', 'mismatch');

-- NO ALTER TABLE ... ENABLE ROW LEVEL SECURITY. Deliberately service-role
-- only. Admin surfaces MUST gate via server routes calling requireAdmin()
-- (is_admin(auth.uid())). Mirrors refund_ledger, stripe_webhook_events,
-- and admin_webhook_events — all have no RLS.

-- Single-quoted, no `||` inside the literal (D5 §7.5 rule).
COMMENT ON TABLE public.refund_reconciliation IS
  'State-machine layer on top of refund_ledger event log; populated by /api/cron/refund-reconciliation. See PR E1.';
