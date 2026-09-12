-- ============================================================================
-- SpecialCarer — C1 / Stripe dispute case model + carer payout hold reason
--
-- Phase B closed the Stripe Connect readiness gate (PR #206) and the append-
-- only refund ledger (PR #207). What's still missing is the case model for
-- disputes themselves: when a dispute lands via webhook, we have nowhere to
-- record it, no state machine, no evidence deadline countdown, and — worst —
-- no way to hold the carer's payout while it's under review. Bookings that
-- go into dispute stay eligible for the weekly payout cron, so money can
-- move OUT via BACS before anyone at Stripe or here reacts to the founder-
-- inbox email that the dispute happened.
--
-- This migration adds:
--   1. `stripe_dispute_cases` — one row per Stripe dispute, keyed by the
--      Stripe dispute id (unique) so re-delivery of `charge.dispute.updated`
--      is a no-op by construction. State machine matches the shape used by
--      dsar_requests (PR #215's ANY-form-tolerant CHECK-drop): the CHECK
--      constraint is added with `IN (...)` but the reconciliation delta
--      tooling matches by shape so baseline reconciliation doesn't drift.
--   2. `bookings.carer_payout_hold_reason` (text, nullable) — the field the
--      weekly payout cron will read to skip disputed bookings. Introduced
--      here (no CHECK constraint) with the sole value `'dispute_open'`
--      written by this PR. Future PRs (e.g. dbs_expired, agency_disable)
--      can add reasons without needing a migration to widen a CHECK.
--
-- Freeze-respectful: additive only. No touch of existing rows. No
-- indexes on existing tables that would rewrite them. RLS is admin-read /
-- service-role-write only (no anon/authenticated policy granted), which
-- means carers cannot query this table directly — they only see "under
-- review" on their existing payout tile via the projection code.
--
-- Deploy-safe: the dispute webhook handler tolerates this table being
-- absent (returns `{ok:true, skippedReason:"schema_not_ready"}`), and
-- the payout-hold module tolerates the column being absent (returns
-- the same shape). So the PR can land before this migration is applied.
-- ============================================================================

-- ── 1. Case table ─────────────────────────────────────────────────────────────

create table if not exists public.stripe_dispute_cases (
  id uuid primary key default gen_random_uuid(),

  -- The booking the disputed charge relates to. Nullable because a very
  -- early webhook can arrive before we've resolved the charge → booking
  -- link (e.g. if a duplicate charge lands from a legacy PI). The
  -- handler tries to resolve booking_id from the payment intent id and
  -- falls back to null if it can't; the admin queue surfaces the
  -- unresolved rows so ops can reconcile manually.
  booking_id uuid references public.bookings(id) on delete set null,

  stripe_charge_id text,                          -- ch_xxx (may be null on charge.dispute.updated for older events)
  stripe_dispute_id text not null,                -- dp_xxx — the case key

  -- State machine. Enum-shape matches PR #215's dsar_requests CHECK
  -- pattern so baseline reconciliation matches by shape (either
  -- `state IN (...)` or `state = ANY (ARRAY[...])`).
  state text not null default 'opened'
    check (state in (
      'opened',              -- charge.dispute.created received
      'evidence_submitted',  -- admin marked evidence uploaded via Stripe dashboard
      'under_review',        -- charge.dispute.updated with status='under_review'
      'won',                 -- charge.dispute.closed with status='won'
      'lost',                -- charge.dispute.closed with status='lost'
      'warning_closed'       -- charge.dispute.closed with status='warning_closed' (no funds moved)
    )),

  reason text,                                    -- Stripe's dispute.reason enum: 'fraudulent' | 'unrecognized' | 'duplicate' | etc
  amount_cents integer,                           -- disputed amount (may be less than charge amount)
  currency text,                                  -- 'gbp' | 'usd'

  evidence_due_at timestamptz,                    -- unix→timestamptz of dispute.evidence_details.due_by
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,                        -- set when state moves to won/lost/warning_closed
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Idempotency: one case per Stripe dispute id. Upserts in the webhook
  -- handler key on this so re-delivery is a no-op even before the
  -- state check-guard runs.
  unique (stripe_dispute_id)
);

create index if not exists stripe_dispute_cases_booking_idx
  on public.stripe_dispute_cases(booking_id);

create index if not exists stripe_dispute_cases_state_idx
  on public.stripe_dispute_cases(state, opened_at desc);

comment on table public.stripe_dispute_cases is
  'One row per Stripe dispute (dp_xxx). Source of truth for our internal dispute state machine; Stripe dashboard remains source of truth for evidence files.';
comment on column public.stripe_dispute_cases.state is
  'Internal state machine. opened → evidence_submitted (admin) → under_review (stripe) → won|lost|warning_closed (terminal). Duplicate webhook delivery is a no-op via the unique index on stripe_dispute_id.';
comment on column public.stripe_dispute_cases.amount_cents is
  'Disputed amount from Stripe (dispute.amount). May be less than the charge amount for partial disputes.';

-- ── 2. Row Level Security: admin-read only, service-role-write ────────────────

alter table public.stripe_dispute_cases enable row level security;

-- No policies granted to anon or authenticated. With RLS enabled and no
-- SELECT/INSERT/UPDATE/DELETE policies, PostgreSQL rejects every non-
-- superuser row access. Only the service-role key (used by the webhook
-- handler and the admin queue's server components) can read/write. This
-- is deliberately the same pattern as refund_ledger (PR #207).
--
-- Carers do NOT see this table directly. Their payout tile reads from
-- bookings.carer_payout_hold_reason (below) and projects the reason
-- string 'dispute_open' as the user-facing label "under review", so
-- the dispute detail (reason code, evidence deadline, amounts) never
-- leaks to the carer.

-- ── 3. bookings.carer_payout_hold_reason ──────────────────────────────────────
--
-- Nullable text column. The weekly payout cron will read this and skip
-- any booking with a non-null value. This PR only ever writes the value
-- 'dispute_open'. Deliberately no CHECK constraint here — future PRs
-- adding reasons ('dbs_expired', 'agency_disable', etc.) should not
-- have to widen a CHECK to add a value; the set of valid reasons is
-- documented in application code in src/lib/payments/payout-hold.ts.
--
-- Backfill: not required. Any pre-existing booking's field is NULL
-- and will remain so unless a dispute lands on it.

alter table public.bookings
  add column if not exists carer_payout_hold_reason text;

comment on column public.bookings.carer_payout_hold_reason is
  'When non-null, the weekly payout cron skips this booking. Values are documented in src/lib/payments/payout-hold.ts. Set to ''dispute_open'' by the Stripe dispute webhook handler; cleared when the dispute is won (and only if the current reason is still ''dispute_open'' — other reasons are preserved).';

-- Partial index — the vast majority of rows have this field NULL, so a
-- partial index keeps the payout cron's WHERE clause on the held set
-- cheap without adding weight to the common case.
create index if not exists bookings_carer_payout_hold_reason_idx
  on public.bookings(carer_payout_hold_reason)
  where carer_payout_hold_reason is not null;
