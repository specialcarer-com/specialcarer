-- ============================================================================
-- BASELINE SCHEMA — pre-migration-system tables created via the dashboard
-- ============================================================================
--
-- Purpose
--   Captures the three `public` tables that were created out-of-band in the
--   Supabase dashboard and therefore never had a `CREATE TABLE` in the repo,
--   even though later migrations ALTER them, index them, and add RLS policies:
--       • public.caregiver_profiles
--       • public.reviews
--       • public.background_checks
--   This file lets a fresh database (local `supabase db reset`, a new replica,
--   CI) reach a state consistent with production.
--
-- ⚠️  RECONSTRUCTED FROM REPO EVIDENCE — NOT A LIVE DUMP. READ BEFORE TRUSTING.
--   The live schema could not be fetched while authoring this file: no Supabase
--   Management API PAT was available in the authoring environment, the project
--   was not linked locally, and no pg_dump/psql was present. Column NAMES,
--   INDEXES and POLICIES below are taken from authoritative repo evidence (the
--   migration history + application code) and are reliable. Column TYPES,
--   DEFAULTS, NULLABILITY and the COMPLETE base-column set are *best-effort
--   inferences* and are NOT verified against production. Items so flagged are
--   marked `UNVERIFIED`.
--
--   A maintainer with a PAT MUST run `supabase db dump --schema public` and
--   reconcile this file against the real schema before it is treated as the
--   source of truth. See: mobile_redesign/db_drift_report.md
--
-- Safety
--   Every statement is guarded (`CREATE TABLE IF NOT EXISTS`,
--   `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DO $$ … $$`
--   existence checks for the enum and `DROP POLICY IF EXISTS` before
--   `CREATE POLICY`). On production — which already has these objects — this
--   migration is a pure NO-OP: it never drops, never alters existing columns,
--   and never touches data. Safe to re-run.
--
-- Timestamp: 20260617120000  (14-digit YYYYMMDDhhmmss, per the repo convention)
-- ============================================================================


-- ============ EXTENSIONS ============
-- caregiver_profiles.home_point uses extensions.geography(Point,4326). PostGIS
-- already exists in prod (see 20260507_postcode_geosearch.sql); guarded so a
-- from-scratch build of this baseline is self-contained.
create extension if not exists postgis with schema extensions;


-- ============ ENUMS ============
-- Verified: defined identically in 20260509_admin_ops_v3_12.sql. Re-declared
-- here (guarded) because caregiver_profiles.application_stage references it, so
-- a from-scratch rebuild of just this baseline must have the type available.
do $$ begin
  if not exists (
    select 1 from pg_type where typname = 'caregiver_application_stage'
  ) then
    create type public.caregiver_application_stage as enum (
      'applied','screening','interview','background_check',
      'training','activated','rejected'
    );
  end if;
end $$;


-- ============ TABLES ============
-- Base columns are created minimally (PK + the columns the repo proves exist).
-- Types for UNVERIFIED columns are best-effort; reconcile against a live dump.

-- ── public.caregiver_profiles ────────────────────────────────────────────────
-- PK user_id is the FK target used throughout the repo
-- (e.g. reviews/bookings reference caregiver_profiles(user_id)).
create table if not exists public.caregiver_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- Base columns evidenced by GIN/GiST indexes, FK usage and app code.
-- TYPES UNVERIFIED except where an index/add-column pins them down.
alter table public.caregiver_profiles
  add column if not exists photo_url text;                          -- UNVERIFIED type
alter table public.caregiver_profiles
  add column if not exists services text[] not null default '{}';   -- UNVERIFIED (array inferred from usage)
alter table public.caregiver_profiles
  add column if not exists tags text[] not null default '{}';       -- text[] inferred from GIN index
alter table public.caregiver_profiles
  add column if not exists certifications text[] not null default '{}'; -- text[] inferred from GIN index
alter table public.caregiver_profiles
  add column if not exists languages text[] not null default '{}';  -- text[] inferred from GIN index
alter table public.caregiver_profiles
  add column if not exists currency text;                           -- UNVERIFIED type
alter table public.caregiver_profiles
  add column if not exists max_radius_km integer;                   -- UNVERIFIED type
alter table public.caregiver_profiles
  add column if not exists hide_precise_location boolean not null default false; -- UNVERIFIED default

-- Columns added by later migrations, replayed here idempotently so this file
-- stands alone on a from-scratch build. (Verified — exact source migration noted.)
alter table public.caregiver_profiles
  add column if not exists care_formats text[] not null default '{}'; -- 20260504_care_formats
alter table public.caregiver_profiles
  add column if not exists postcode text;                            -- 20260507_postcode_geosearch
alter table public.caregiver_profiles
  add column if not exists home_lat double precision;                -- 20260610_caregiver_latlng_columns
alter table public.caregiver_profiles
  add column if not exists home_lng double precision;                -- 20260610_caregiver_latlng_columns
alter table public.caregiver_profiles
  add column if not exists home_point extensions.geography(Point, 4326); -- 20260507_postcode_geosearch
alter table public.caregiver_profiles
  add column if not exists online_radius_km integer;                 -- presence/online feature
alter table public.caregiver_profiles
  add column if not exists is_online boolean not null default false;  -- 20260609200500_carer_online_status
alter table public.caregiver_profiles
  add column if not exists last_online_at timestamptz;               -- 20260609200500_carer_online_status
alter table public.caregiver_profiles
  add column if not exists gender text;                              -- filter attrs
alter table public.caregiver_profiles
  add column if not exists referral_code text;                       -- referrals_v1
alter table public.caregiver_profiles
  add column if not exists referred_by uuid references auth.users(id); -- referrals_v1
alter table public.caregiver_profiles
  add column if not exists weekly_rate_cents integer;                -- 20260611120000_caregiver_rates_v1
alter table public.caregiver_profiles
  add column if not exists application_stage
    public.caregiver_application_stage not null default 'applied';   -- 20260509_admin_ops_v3_12
alter table public.caregiver_profiles
  add column if not exists stage_entered_at timestamptz not null default now(); -- 20260509_admin_ops_v3_12

-- ── public.reviews ───────────────────────────────────────────────────────────
-- Base columns UNVERIFIED (table created via dashboard). rating_*/tags columns
-- are verified additions from 20260509_reviews_v2.sql.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid()
);
alter table public.reviews
  add column if not exists booking_id uuid references public.bookings(id) on delete cascade; -- UNVERIFIED FK/nullability
alter table public.reviews
  add column if not exists reviewer_id uuid references auth.users(id) on delete cascade;     -- UNVERIFIED
alter table public.reviews
  add column if not exists caregiver_id uuid references auth.users(id) on delete cascade;    -- UNVERIFIED
alter table public.reviews
  add column if not exists rating int check (rating between 1 and 5);  -- UNVERIFIED (overall rating)
alter table public.reviews
  add column if not exists comment text;                               -- UNVERIFIED (body/comment)
alter table public.reviews
  add column if not exists created_at timestamptz not null default now(); -- UNVERIFIED default
-- Verified additions (20260509_reviews_v2.sql):
alter table public.reviews
  add column if not exists rating_punctuality int check (rating_punctuality between 1 and 5);
alter table public.reviews
  add column if not exists rating_communication int check (rating_communication between 1 and 5);
alter table public.reviews
  add column if not exists rating_care_quality int check (rating_care_quality between 1 and 5);
alter table public.reviews
  add column if not exists rating_cleanliness int check (rating_cleanliness between 1 and 5);
alter table public.reviews
  add column if not exists tags text[] not null default '{}';

-- ── public.background_checks ─────────────────────────────────────────────────
-- Base columns UNVERIFIED (table created via dashboard). reverify_*/source and
-- the next_us_check_due_at index are verified additions.
create table if not exists public.background_checks (
  id uuid primary key default gen_random_uuid()
);
alter table public.background_checks
  add column if not exists caregiver_id uuid references auth.users(id) on delete cascade; -- UNVERIFIED
alter table public.background_checks
  add column if not exists status text;                                -- UNVERIFIED
alter table public.background_checks
  add column if not exists next_us_check_due_at date;                  -- index target (verified)
alter table public.background_checks
  add column if not exists created_at timestamptz not null default now(); -- UNVERIFIED default
-- Verified additions:
alter table public.background_checks
  add column if not exists source text default 'fresh_checkr';                 -- 20260514_dbs_update_service_v1
alter table public.background_checks
  add column if not exists update_service_subscription_id text;                -- 20260514_dbs_update_service_v1
alter table public.background_checks
  add column if not exists reverify_status text not null default 'none';       -- reverify feature
alter table public.background_checks
  add column if not exists reverify_cadence_months int not null default 12;    -- reverify feature
alter table public.background_checks
  add column if not exists next_reverify_at date;                              -- reverify feature


-- ============ INDEXES ============
-- All verified — these exact index definitions appear in repo migrations.
create index if not exists caregiver_profiles_tags_gin
  on public.caregiver_profiles using gin (tags);
create index if not exists caregiver_profiles_certifications_gin
  on public.caregiver_profiles using gin (certifications);
create index if not exists caregiver_profiles_languages_gin
  on public.caregiver_profiles using gin (languages);
create index if not exists caregiver_profiles_care_formats_gin
  on public.caregiver_profiles using gin (care_formats);
create index if not exists caregiver_profiles_home_point_gist
  on public.caregiver_profiles using gist (home_point);
create index if not exists caregiver_profiles_online_idx
  on public.caregiver_profiles (is_online, last_online_at);
create unique index if not exists caregiver_profiles_referral_code_uidx
  on public.caregiver_profiles (referral_code)
  where referral_code is not null;
create index if not exists background_checks_next_us_check_due_idx
  on public.background_checks (next_us_check_due_at);


-- ============ RLS + POLICIES ============
-- Verified from 20260609200500_carer_online_status.sql.
alter table public.caregiver_profiles enable row level security;
alter table public.reviews            enable row level security;
alter table public.background_checks  enable row level security;

drop policy if exists "caregiver_profiles_self_presence_update"
  on public.caregiver_profiles;
create policy "caregiver_profiles_self_presence_update"
  on public.caregiver_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- NOTE: reviews and background_checks have RLS enabled in production with
-- policies that could NOT be captured here (no live dump). Their policy
-- definitions are an open reconciliation item — see the drift report. RLS is
-- enabled above so a from-scratch build is deny-by-default rather than
-- accidentally world-readable.
