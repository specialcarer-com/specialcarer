-- ============================================================================
-- BASELINE SCHEMA — verified from live production dump
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
-- ✅ VERIFIED AGAINST LIVE SCHEMA
--   Reconstructed by querying `information_schema.columns`, `pg_constraint`,
--   `pg_indexes`, `pg_policies`, and `pg_enum` against Supabase project
--   qupjaanyhnuvlexkwtpq on 2026-06-25. Every column type, default, nullability,
--   constraint, index, and policy below matches production exactly.
--
-- Safety
--   Every statement is guarded (`CREATE TABLE IF NOT EXISTS`,
--   `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DO $$ … $$`
--   existence checks for enums, and `DROP POLICY IF EXISTS` before
--   `CREATE POLICY`). On production — which already has these objects — this
--   migration is a pure NO-OP: it never drops, never alters existing columns,
--   and never touches data. Safe to re-run.
--
-- Timestamp: 20260625080000  (14-digit YYYYMMDDhhmmss, per the repo convention)
-- ============================================================================


-- ============ EXTENSIONS ============
-- caregiver_profiles.home_point uses extensions.geography(Point,4326).
create extension if not exists postgis with schema extensions;


-- ============ ENUMS ============
-- bg_vendor
do $$ begin
  if not exists (select 1 from pg_type where typname = 'bg_vendor') then
    create type public.bg_vendor as enum ('uchecks', 'checkr');
  end if;
end $$;

-- bg_check_type
do $$ begin
  if not exists (select 1 from pg_type where typname = 'bg_check_type') then
    create type public.bg_check_type as enum (
      'enhanced_dbs_barred',
      'right_to_work',
      'digital_id',
      'us_criminal',
      'us_mvr',
      'us_healthcare_sanctions'
    );
  end if;
end $$;

-- bg_check_status
do $$ begin
  if not exists (select 1 from pg_type where typname = 'bg_check_status') then
    create type public.bg_check_status as enum (
      'not_started',
      'invited',
      'in_progress',
      'submitted',
      'pending_result',
      'cleared',
      'consider',
      'failed',
      'expired',
      'cancelled'
    );
  end if;
end $$;

-- caregiver_application_stage
do $$ begin
  if not exists (select 1 from pg_type where typname = 'caregiver_application_stage') then
    create type public.caregiver_application_stage as enum (
      'applied',
      'screening',
      'interview',
      'background_check',
      'training',
      'activated',
      'rejected'
    );
  end if;
end $$;


-- ============================================================================
-- TABLE: public.caregiver_profiles
-- ============================================================================
create table if not exists public.caregiver_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.caregiver_profiles
  add column if not exists display_name text,
  add column if not exists headline text,
  add column if not exists bio text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists country text,
  add column if not exists services text[] not null default '{}'::text[],
  add column if not exists hourly_rate_cents integer,
  add column if not exists currency text,
  add column if not exists years_experience integer,
  add column if not exists languages text[] not null default '{}'::text[],
  add column if not exists max_radius_km integer,
  add column if not exists photo_url text,
  add column if not exists is_published boolean not null default false,
  add column if not exists rating_avg numeric,
  add column if not exists rating_count integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists care_formats text[] not null default '{}'::text[],
  add column if not exists weekly_rate_cents integer,
  add column if not exists gender text,
  add column if not exists has_drivers_license boolean not null default false,
  add column if not exists has_own_vehicle boolean not null default false,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists certifications text[] not null default '{}'::text[],
  add column if not exists postcode text,
  add column if not exists home_point extensions.geography(Point, 4326),
  add column if not exists hide_precise_location boolean not null default true,
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references auth.users(id) on delete set null,
  add column if not exists application_stage public.caregiver_application_stage
    not null default 'applied'::public.caregiver_application_stage,
  add column if not exists stage_entered_at timestamptz not null default now(),
  add column if not exists public_slug text;

-- Check constraints (guarded via DO blocks so re-runs are safe)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'caregiver_profiles_country_check') then
    alter table public.caregiver_profiles
      add constraint caregiver_profiles_country_check
      check (country = any (array['GB'::text, 'US'::text]));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caregiver_profiles_currency_check') then
    alter table public.caregiver_profiles
      add constraint caregiver_profiles_currency_check
      check (currency = any (array['GBP'::text, 'USD'::text]));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caregiver_profiles_hourly_rate_check') then
    alter table public.caregiver_profiles
      add constraint caregiver_profiles_hourly_rate_check
      check (hourly_rate_cents is null or (hourly_rate_cents >= 800 and hourly_rate_cents <= 20000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caregiver_profiles_weekly_rate_check') then
    alter table public.caregiver_profiles
      add constraint caregiver_profiles_weekly_rate_check
      check (weekly_rate_cents is null or (weekly_rate_cents >= 10000 and weekly_rate_cents <= 500000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caregiver_profiles_max_radius_check') then
    alter table public.caregiver_profiles
      add constraint caregiver_profiles_max_radius_check
      check (max_radius_km is null or (max_radius_km >= 1 and max_radius_km <= 200));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caregiver_profiles_years_experience_check') then
    alter table public.caregiver_profiles
      add constraint caregiver_profiles_years_experience_check
      check (years_experience is null or (years_experience >= 0 and years_experience <= 60));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caregiver_profiles_gender_check') then
    alter table public.caregiver_profiles
      add constraint caregiver_profiles_gender_check
      check (gender is null or gender = any (array['female'::text, 'male'::text, 'non_binary'::text, 'prefer_not_to_say'::text]));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caregiver_profiles_care_formats_check') then
    alter table public.caregiver_profiles
      add constraint caregiver_profiles_care_formats_check
      check (care_formats <@ array['live_in'::text, 'visiting'::text]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caregiver_profiles_tags_max_check') then
    alter table public.caregiver_profiles
      add constraint caregiver_profiles_tags_max_check
      check (array_length(tags, 1) is null or array_length(tags, 1) <= 24);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caregiver_profiles_certifications_max_check') then
    alter table public.caregiver_profiles
      add constraint caregiver_profiles_certifications_max_check
      check (array_length(certifications, 1) is null or array_length(certifications, 1) <= 32);
  end if;
end $$;

create index if not exists caregiver_profiles_country_city_idx
  on public.caregiver_profiles using btree (country, lower(city));
create index if not exists caregiver_profiles_published_idx
  on public.caregiver_profiles using btree (is_published) where (is_published = true);
create index if not exists caregiver_profiles_services_gin
  on public.caregiver_profiles using gin (services);
create index if not exists caregiver_profiles_languages_gin
  on public.caregiver_profiles using gin (languages);
create index if not exists caregiver_profiles_care_formats_gin
  on public.caregiver_profiles using gin (care_formats);
create index if not exists caregiver_profiles_tags_gin
  on public.caregiver_profiles using gin (tags);
create index if not exists caregiver_profiles_certs_gin
  on public.caregiver_profiles using gin (certifications);
create index if not exists caregiver_profiles_home_point_gix
  on public.caregiver_profiles using gist (home_point);
create unique index if not exists caregiver_profiles_public_slug_key
  on public.caregiver_profiles using btree (public_slug) where (public_slug is not null);
create unique index if not exists caregiver_profiles_referral_code_key
  on public.caregiver_profiles using btree (referral_code) where (referral_code is not null);

alter table public.caregiver_profiles enable row level security;

drop policy if exists "caregiver reads own profile" on public.caregiver_profiles;
create policy "caregiver reads own profile" on public.caregiver_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "caregiver inserts own profile" on public.caregiver_profiles;
create policy "caregiver inserts own profile" on public.caregiver_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "caregiver updates own profile" on public.caregiver_profiles;
create policy "caregiver updates own profile" on public.caregiver_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "public reads published profiles" on public.caregiver_profiles;
create policy "public reads published profiles" on public.caregiver_profiles
  for select using (is_published = true);

drop policy if exists "admins read all caregiver_profiles" on public.caregiver_profiles;
create policy "admins read all caregiver_profiles" on public.caregiver_profiles
  for select using (is_admin(auth.uid()));


-- ============================================================================
-- TABLE: public.reviews
-- ============================================================================
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid()
);

alter table public.reviews
  add column if not exists booking_id uuid not null references public.bookings(id) on delete cascade,
  add column if not exists reviewer_id uuid not null references auth.users(id) on delete cascade,
  add column if not exists caregiver_id uuid not null references auth.users(id) on delete cascade,
  add column if not exists rating integer not null,
  add column if not exists body text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references auth.users(id) on delete set null,
  add column if not exists hidden_reason text,
  add column if not exists rating_punctuality integer,
  add column if not exists rating_communication integer,
  add column if not exists rating_care_quality integer,
  add column if not exists rating_cleanliness integer,
  add column if not exists tags text[] not null default '{}'::text[];

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_rating_check') then
    alter table public.reviews add constraint reviews_rating_check check (rating >= 1 and rating <= 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reviews_rating_punctuality_check') then
    alter table public.reviews add constraint reviews_rating_punctuality_check check (rating_punctuality >= 1 and rating_punctuality <= 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reviews_rating_communication_check') then
    alter table public.reviews add constraint reviews_rating_communication_check check (rating_communication >= 1 and rating_communication <= 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reviews_rating_care_quality_check') then
    alter table public.reviews add constraint reviews_rating_care_quality_check check (rating_care_quality >= 1 and rating_care_quality <= 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reviews_rating_cleanliness_check') then
    alter table public.reviews add constraint reviews_rating_cleanliness_check check (rating_cleanliness >= 1 and rating_cleanliness <= 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reviews_booking_id_reviewer_id_key') then
    alter table public.reviews add constraint reviews_booking_id_reviewer_id_key unique (booking_id, reviewer_id);
  end if;
end $$;

create index if not exists reviews_caregiver_idx
  on public.reviews using btree (caregiver_id, created_at desc);

alter table public.reviews enable row level security;

drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own" on public.reviews
  for insert with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = reviews.booking_id
        and b.seeker_id = auth.uid()
        and b.caregiver_id = reviews.caregiver_id
        and b.status = any (array['completed'::booking_status, 'paid_out'::booking_status])
    )
  );

drop policy if exists "reviews_public_visible_only" on public.reviews;
create policy "reviews_public_visible_only" on public.reviews
  for select using (hidden_at is null);

drop policy if exists "admins read all reviews" on public.reviews;
create policy "admins read all reviews" on public.reviews
  for select using (is_admin(auth.uid()));


-- ============================================================================
-- TABLE: public.background_checks
-- ============================================================================
create table if not exists public.background_checks (
  id uuid primary key default gen_random_uuid()
);

alter table public.background_checks
  add column if not exists user_id uuid not null references auth.users(id) on delete cascade,
  add column if not exists vendor public.bg_vendor not null,
  add column if not exists check_type public.bg_check_type not null,
  add column if not exists status public.bg_check_status not null default 'not_started'::public.bg_check_status,
  add column if not exists vendor_applicant_id text,
  add column if not exists vendor_check_id text,
  add column if not exists invite_url text,
  add column if not exists issued_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists result_summary text,
  add column if not exists raw jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists next_reverify_at date,
  add column if not exists reverify_cadence_months integer not null default 12,
  add column if not exists reverify_status text not null default 'none'::text,
  add column if not exists source text default 'fresh_checkr'::text,
  add column if not exists update_service_subscription_id text,
  add column if not exists update_service_consent_at timestamptz,
  add column if not exists last_us_check_at timestamptz,
  add column if not exists next_us_check_due_at timestamptz,
  add column if not exists us_check_result jsonb,
  add column if not exists workforce_type text,
  add column if not exists us_reminder_sent_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'background_checks_user_id_vendor_check_type_key') then
    alter table public.background_checks
      add constraint background_checks_user_id_vendor_check_type_key unique (user_id, vendor, check_type);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'background_checks_reverify_status_check') then
    alter table public.background_checks
      add constraint background_checks_reverify_status_check
      check (reverify_status = any (array['none'::text, 'due'::text, 'overdue'::text, 'in_progress'::text, 'cleared'::text]));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'background_checks_source_check') then
    alter table public.background_checks
      add constraint background_checks_source_check
      check (source is null or source = any (array['fresh_checkr'::text, 'update_service'::text, 'admin_manual'::text]));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'background_checks_workforce_type_check') then
    alter table public.background_checks
      add constraint background_checks_workforce_type_check
      check (workforce_type is null or workforce_type = any (array['adult'::text, 'child'::text, 'both'::text]));
  end if;
end $$;

create index if not exists background_checks_user_id_idx
  on public.background_checks using btree (user_id);
create index if not exists background_checks_status_idx
  on public.background_checks using btree (status);
create index if not exists background_checks_vendor_applicant_id_idx
  on public.background_checks using btree (vendor_applicant_id);
create index if not exists idx_background_checks_us_recheck
  on public.background_checks using btree (next_us_check_due_at)
  where (source = 'update_service'::text and next_us_check_due_at is not null);

alter table public.background_checks enable row level security;

drop policy if exists "users read own background checks" on public.background_checks;
create policy "users read own background checks" on public.background_checks
  for select using (auth.uid() = user_id);

drop policy if exists "admins read all bg_checks" on public.background_checks;
create policy "admins read all bg_checks" on public.background_checks
  for select using (is_admin(auth.uid()));
