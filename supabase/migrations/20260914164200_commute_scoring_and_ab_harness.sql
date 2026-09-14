-- ============================================================================
-- SpecialCarer — E3: commute-aware scoring + accept-rate A/B harness
--
-- Additive-only DDL for PR #E3.
--
-- Scope
-- ─────
--   1. `public.caregiver_commute_cache`
--        Per-carer / per-geohash-6 commute-minutes cache. Backs
--        src/lib/mapbox/matrix.ts:getCommuteMinutes(). 30-day TTL is
--        enforced in application code (readers ignore rows older than
--        that); the row is retained so recent debugging / staleness
--        reasoning is possible. Primary key (carer_id, origin_geohash6)
--        makes upserts trivially idempotent.
--
--   2. `public.mapbox_matrix_daily_counter`
--        Small counter table used by the Mapbox Matrix client's hard
--        daily-call cap. One row per calendar day (UTC). Atomically
--        upsert-and-increment so we can bound the Mapbox bill even
--        under a stampede.
--
--   3. `public.match_experiments`
--        Experiment registry. Currently a single row (`commute_scoring_v1`
--        — inserted at the tail of this migration behind
--        `on conflict do nothing`) but the shape is generic so future
--        A/B tests plug in the same way.
--
--   4. `public.match_experiment_assignments`
--        Sticky (experiment_id, booking_id → variant) mapping. Written
--        idempotently by src/lib/experiments/assign.ts. Booking-level
--        subject per the discovery doc (see phase_e/e3_discovery.md).
--
--   5. `public.experiment_daily_rollup`
--        Per-experiment / per-variant / per-day aggregate written by
--        the /api/cron/experiment-rollup daily worker. Backs the
--        admin readout at /admin/experiments/[id].
--
--   6. New nullable columns on `public.booking_match_offers`:
--        - experiment_id text
--        - variant       text
--        No backfill — the table has 0 rows in prod as of migration
--        tip 20260914114600 (verified in phase_e/e3_discovery.md).
--        Writers populate them going forward.
--
-- Governance / freeze-respectful
-- ──────────────────────────────
-- * Additive only. No DROP, no ALTER ... DROP, no TRUNCATE, no
--   DELETE, no `drop policy if exists`. PR #220's preflight
--   destructive-diff gate will pass without an Allow-Destructive
--   trailer.
-- * No pipe operator (`||`) in DDL literal clauses — comment strings
--   are single literals.
-- * Role check uses `public.is_admin(auth.uid())`. RM / NI roles are
--   not yet split out — TODO(rm-ni-split) markers below flag the
--   places to widen when they land, matching the pattern already used
--   by 20260912172500_account_deletion_jobs.sql and
--   20260912180000_notifiable_events_storage.sql.
-- * RLS on every new table. Service-role writer bypasses RLS
--   (createAdminClient() pattern), admins get a read policy, seekers
--   and carers see NOTHING (experiments are an internal telemetry
--   surface for E3).
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- 1. caregiver_commute_cache
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.caregiver_commute_cache (
  -- Carer whose home_point was queried against the booking origin.
  carer_id uuid not null references public.profiles(id) on delete cascade,

  -- Origin coordinate truncated to a geohash-6 (~1.2km precision) so
  -- that two bookings whose origins land in the same ~1.2km cell
  -- share a cache entry. Truncation happens in application code
  -- (src/lib/mapbox/matrix.ts) — this column just stores whatever the
  -- writer produced. 6 characters expected but not check-constrained
  -- (kept liberal in case we change precision later).
  origin_geohash6 text not null,

  -- Commute time in minutes, driving profile. Numeric (not integer)
  -- because Mapbox Matrix returns seconds and we convert with a
  -- single divide, no rounding lost.
  minutes numeric not null,

  computed_at timestamptz not null default now(),

  primary key (carer_id, origin_geohash6)
);

comment on table public.caregiver_commute_cache is
  'Per-carer / per-origin-geohash6 commute-minutes cache backing src/lib/mapbox/matrix.ts:getCommuteMinutes(). 30-day TTL enforced in application code; rows older than that are ignored and lazily overwritten on the next lookup.';

comment on column public.caregiver_commute_cache.origin_geohash6 is
  'Booking-origin lat/lng truncated to a geohash-6 (~1.2km precision). Bookings within the same cell share a cache row so Mapbox bill scales by neighbourhood, not by booking.';

comment on column public.caregiver_commute_cache.minutes is
  'Driving-profile commute minutes from origin cell to caregiver home_point. Stub mode (see matrix.ts) writes distance_km * 3 as a deterministic fake.';

-- Freshness-based reads use both keys; a compound covering index is
-- already implicit via the PK. No additional secondary index.

alter table public.caregiver_commute_cache enable row level security;

-- Admins can read the cache for debugging (why did this carer score
-- as they did? what's the cache freshness?). Nobody else sees rows.
-- TODO(rm-ni-split): widen when RM / NI roles land.
create policy caregiver_commute_cache_admin_read on public.caregiver_commute_cache
  for select
  to authenticated
  using (public.is_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────
-- 2. mapbox_matrix_daily_counter
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.mapbox_matrix_daily_counter (
  day date primary key,
  calls integer not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.mapbox_matrix_daily_counter is
  'Bounded counter for Mapbox Matrix API calls per UTC day. Read + atomically incremented by src/lib/mapbox/matrix.ts to enforce a hard daily cap (default 500, env-tunable via MAPBOX_MATRIX_DAILY_CAP).';

alter table public.mapbox_matrix_daily_counter enable row level security;

-- Admin-read only. Writer is service-role which bypasses RLS.
-- TODO(rm-ni-split): widen when RM / NI roles land.
create policy mapbox_matrix_daily_counter_admin_read on public.mapbox_matrix_daily_counter
  for select
  to authenticated
  using (public.is_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────
-- 3. match_experiments
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.match_experiments (
  id text primary key,
  description text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  concluded_at timestamptz
);

comment on table public.match_experiments is
  'Registry of matching-engine A/B experiments. One row per experiment id (e.g. commute_scoring_v1). Set active=true to start bucketing new bookings.';

alter table public.match_experiments enable row level security;

-- TODO(rm-ni-split): widen when RM / NI roles land.
create policy match_experiments_admin_read on public.match_experiments
  for select
  to authenticated
  using (public.is_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────
-- 4. match_experiment_assignments
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.match_experiment_assignments (
  experiment_id text not null references public.match_experiments(id) on delete cascade,

  -- booking_id — we assign at booking level (see phase_e/e3_discovery.md
  -- for the rationale). Kept as `subject_id` to leave the door open to
  -- future seeker-level or carer-level experiments without a schema
  -- change; the code path in src/lib/experiments/assign.ts always
  -- passes a booking id today.
  subject_id uuid not null,

  variant text not null check (variant in ('control', 'treatment')),

  assigned_at timestamptz not null default now(),

  primary key (experiment_id, subject_id)
);

comment on table public.match_experiment_assignments is
  'Sticky variant assignment per (experiment, subject) pair. Written idempotently by src/lib/experiments/assign.ts on the first runAutoMatch() call for a booking; never re-rolled.';

comment on column public.match_experiment_assignments.subject_id is
  'Assignment subject. Today always a booking_id. Kept generic so future seeker-level or carer-level experiments can share the table.';

alter table public.match_experiment_assignments enable row level security;

-- TODO(rm-ni-split): widen when RM / NI roles land.
create policy match_experiment_assignments_admin_read on public.match_experiment_assignments
  for select
  to authenticated
  using (public.is_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────
-- 5. experiment_daily_rollup
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.experiment_daily_rollup (
  experiment_id text not null references public.match_experiments(id) on delete cascade,
  variant text not null check (variant in ('control', 'treatment')),
  day date not null,

  n_offers integer not null default 0,
  n_accepted integer not null default 0,
  n_declined integer not null default 0,
  n_expired integer not null default 0,

  updated_at timestamptz not null default now(),

  primary key (experiment_id, variant, day)
);

comment on table public.experiment_daily_rollup is
  'Daily per-arm rollup of booking_match_offers for each experiment. Written by /api/cron/experiment-rollup at 05:00 UTC; read by the admin readout at /admin/experiments/[id]. Idempotent upsert on (experiment_id, variant, day).';

alter table public.experiment_daily_rollup enable row level security;

-- TODO(rm-ni-split): widen when RM / NI roles land.
create policy experiment_daily_rollup_admin_read on public.experiment_daily_rollup
  for select
  to authenticated
  using (public.is_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────
-- 6. booking_match_offers — experiment attribution columns
-- ─────────────────────────────────────────────────────────────────────────

-- Both nullable, no backfill needed (0 rows in prod). Writers in
-- src/lib/match/auto-match.ts populate them going forward. Old rows
-- (there are none today) would have NULL on both, which the rollup
-- cron treats as "not in any experiment" and skips.
alter table public.booking_match_offers
  add column if not exists experiment_id text;

alter table public.booking_match_offers
  add column if not exists variant text;

comment on column public.booking_match_offers.experiment_id is
  'Experiment id this offer was scored under (e.g. commute_scoring_v1). NULL when no experiment was active at the time. Populated by runAutoMatch().';

comment on column public.booking_match_offers.variant is
  'Assigned variant for this offer. NULL when experiment_id is NULL.';


-- ─────────────────────────────────────────────────────────────────────────
-- 7. Seed the first experiment row
-- ─────────────────────────────────────────────────────────────────────────

-- Registered but inactive. Flip active=true when ready to start
-- bucketing (see the E3 delivery report for the SQL snippet).
insert into public.match_experiments (id, description, active)
values (
  'commute_scoring_v1',
  'Commute-aware scoring vs. crow-flies distance in the matcher. Treatment uses distance/commute/rating/response_rate/recency/completion weights of 20/25/25/15/10/5; control uses the pre-E3 40/30/15/10/5 baseline.',
  false
)
on conflict (id) do nothing;
