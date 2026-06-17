-- ============================================================================
-- SpecialCarers — Mobile Redesign R2 schema (PR-R2)
--
-- Turns the heuristically-derived "verified" flag and unstructured
-- qualifications (previously inferred from caregiver_profiles.certifications)
-- into first-class structured data, and gives rating_avg/rating_count an
-- in-repo refresh mechanism. Consumed by the redesigned <CarerCard> (PR-R1),
-- gated at the application layer behind NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED.
--
-- Four logical parts, one file (mirrors the caregiver_rates_v1 / reviews_v2
-- convention of bundling a feature's schema into a single timestamped
-- migration):
--   1. qualification_kind enum
--   2. public.carer_qualifications table (+ indexes, RLS, updated_at trigger)
--   3. canonical verified_status columns on caregiver_profiles (+ backfill)
--   4. refresh_carer_rating() + trigger on reviews (+ backfill)
--
-- Schema notes (reconciled against the live schema via repo evidence — see
-- 20260617120000_baseline_schema.sql):
--   • caregiver_profiles' PRIMARY KEY is user_id (uuid -> auth.users), there is
--     no separate `id` column. carer_qualifications.carer_id therefore
--     references caregiver_profiles(user_id).
--   • reviews.caregiver_id holds the carer's auth.users id, i.e. equal to
--     caregiver_profiles.user_id — the rating refresh joins on that.
--   • rating_avg / rating_count already exist on caregiver_profiles in
--     production (used by the carer search handler); added here guardedly so a
--     from-scratch build (local db reset / CI) is self-consistent.
--
-- Idempotent throughout: guarded enum creation, IF NOT EXISTS on tables /
-- columns / indexes, DROP ... IF EXISTS before CREATE for policies and
-- triggers. Safe to re-run; a pure no-op where objects already exist.
-- ============================================================================


-- ============================================================================
-- PART 1 — qualification_kind enum
-- ============================================================================
do $$ begin
  create type public.qualification_kind as enum (
    'NVQ_L2',
    'NVQ_L3',
    'NVQ_L4',
    'NVQ_L5',
    'RMN',
    'RGN',
    'CARE_CERT',
    'DIPLOMA_HEALTH_SOCIAL_CARE',
    'OTHER'
  );
exception
  when duplicate_object then null;
end $$;


-- ============================================================================
-- PART 2 — public.carer_qualifications
-- ============================================================================
create table if not exists public.carer_qualifications (
  id uuid primary key default gen_random_uuid(),
  carer_id uuid not null
    references public.caregiver_profiles(user_id) on delete cascade,
  kind public.qualification_kind not null,
  label text,                 -- free-text refinement, e.g. "NVQ Level 3 Health & Social Care"
  awarding_body text,
  awarded_on date,
  evidence_url text,          -- Supabase storage path
  verified_at timestamptz,    -- null until an admin verifies the evidence
  verified_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.carer_qualifications is
  'Structured carer qualifications (PR-R2). One row per qualification; verified_at is null until an admin verifies the evidence. Surfaced to seekers only once verified. Replaces the certifications text[] heuristic behind MOBILE_REDESIGN_ENABLED.';

create index if not exists carer_qualifications_carer_idx
  on public.carer_qualifications (carer_id);
create index if not exists carer_qualifications_carer_kind_idx
  on public.carer_qualifications (carer_id, kind);
create index if not exists carer_qualifications_verified_idx
  on public.carer_qualifications (carer_id)
  where verified_at is not null;

-- updated_at trigger (mirrors public.touch_identity_verifications_updated_at).
create or replace function public.touch_carer_qualifications_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_carer_qualifications_touch
  on public.carer_qualifications;
create trigger trg_carer_qualifications_touch
  before update on public.carer_qualifications
  for each row execute function public.touch_carer_qualifications_updated_at();

-- ----------------------------------------------------------------------------
-- RLS:
--   • A carer may read / insert / update their own rows (carer_id = auth.uid()).
--   • Any authenticated user may read rows that have been verified
--     (verified_at is not null) so seekers can see verified quals.
--   • The service-role (admin) client bypasses RLS, so verification writes and
--     deletes go through it; no explicit service-role policy is required.
-- ----------------------------------------------------------------------------
alter table public.carer_qualifications enable row level security;

drop policy if exists "carer_qualifications_own_select"
  on public.carer_qualifications;
create policy "carer_qualifications_own_select"
  on public.carer_qualifications for select
  to authenticated
  using (auth.uid() = carer_id);

drop policy if exists "carer_qualifications_verified_select"
  on public.carer_qualifications;
create policy "carer_qualifications_verified_select"
  on public.carer_qualifications for select
  to authenticated
  using (verified_at is not null);

drop policy if exists "carer_qualifications_own_insert"
  on public.carer_qualifications;
create policy "carer_qualifications_own_insert"
  on public.carer_qualifications for insert
  to authenticated
  with check (auth.uid() = carer_id);

drop policy if exists "carer_qualifications_own_update"
  on public.carer_qualifications;
create policy "carer_qualifications_own_update"
  on public.carer_qualifications for update
  to authenticated
  using (auth.uid() = carer_id)
  with check (auth.uid() = carer_id);


-- ============================================================================
-- PART 3 — canonical verified flag on caregiver_profiles
--
-- Replaces the ad-hoc EXISTS-on-certifications heuristic with a canonical
-- verification lifecycle. Backfill marks carers with an approved background
-- check as verified; everyone else stays 'pending'.
-- ============================================================================
alter table public.caregiver_profiles
  add column if not exists verified_status text not null default 'pending';

-- Add the check constraint guardedly (can't IF NOT EXISTS a constraint inline).
do $$ begin
  alter table public.caregiver_profiles
    add constraint caregiver_profiles_verified_status_check
    check (verified_status in ('pending','verified','rejected','expired'));
exception
  when duplicate_object then null;
end $$;

alter table public.caregiver_profiles
  add column if not exists verified_at timestamptz;
alter table public.caregiver_profiles
  add column if not exists verified_reason text;   -- internal note

-- Backfill: any carer with an approved background_check is verified.
-- Guarded so re-runs don't clobber a status that has since changed.
update public.caregiver_profiles cp
set verified_status = 'verified',
    verified_at = coalesce(cp.verified_at, now()),
    verified_reason = coalesce(cp.verified_reason, 'backfill: approved background check')
where cp.verified_status = 'pending'
  and exists (
    select 1
    from public.background_checks bc
    where bc.caregiver_id = cp.user_id
      and bc.status = 'approved'
  );


-- ============================================================================
-- PART 4 — rating refresh function + trigger on reviews
--
-- caregiver_profiles.rating_avg / rating_count had no in-repo refresh
-- mechanism. Recompute both from the reviews table whenever a review changes.
-- ============================================================================

-- rating_avg / rating_count exist in production; guarded for from-scratch builds.
alter table public.caregiver_profiles
  add column if not exists rating_avg numeric;
alter table public.caregiver_profiles
  add column if not exists rating_count integer not null default 0;

create or replace function public.refresh_carer_rating(p_carer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.caregiver_profiles cp
  set rating_avg = agg.avg_rating,
      rating_count = agg.cnt
  from (
    select
      round(avg(r.rating)::numeric, 2) as avg_rating,
      count(r.rating) as cnt
    from public.reviews r
    where r.caregiver_id = p_carer_id
      and r.rating is not null
  ) agg
  where cp.user_id = p_carer_id;
end$$;

create or replace function public.trg_refresh_carer_rating()
returns trigger
language plpgsql
as $$
begin
  -- Refresh the affected carer(s). On UPDATE the carer can change, so refresh
  -- both the old and new carer.
  if (tg_op = 'DELETE') then
    if old.caregiver_id is not null then
      perform public.refresh_carer_rating(old.caregiver_id);
    end if;
    return old;
  end if;

  if new.caregiver_id is not null then
    perform public.refresh_carer_rating(new.caregiver_id);
  end if;
  if (tg_op = 'UPDATE'
      and old.caregiver_id is not null
      and old.caregiver_id is distinct from new.caregiver_id) then
    perform public.refresh_carer_rating(old.caregiver_id);
  end if;
  return new;
end$$;

drop trigger if exists trg_reviews_refresh_carer_rating on public.reviews;
create trigger trg_reviews_refresh_carer_rating
  after insert or update or delete on public.reviews
  for each row execute function public.trg_refresh_carer_rating();

-- Backfill: recompute every carer's rating once.
do $$
declare
  r record;
begin
  for r in select user_id from public.caregiver_profiles loop
    perform public.refresh_carer_rating(r.user_id);
  end loop;
end $$;


-- ============================================================================
-- MANUAL VERIFICATION — rating refresh trigger
--
-- No local Supabase / pg instance was available in the authoring environment,
-- so the trigger is verified manually. Run this against a local
-- `supabase db reset` (or a scratch carer in staging) to confirm the trigger
-- keeps rating_avg / rating_count in sync on INSERT / UPDATE / DELETE:
--
--   -- pick (or create) a carer
--   select user_id from public.caregiver_profiles limit 1;  -- :carer
--
--   -- INSERT two reviews → avg 4.5, count 2
--   insert into public.reviews (caregiver_id, rating) values (:carer, 4), (:carer, 5);
--   select rating_avg, rating_count from public.caregiver_profiles where user_id = :carer;
--   --> 4.50 | 2
--
--   -- UPDATE a rating → avg recomputes
--   update public.reviews set rating = 1 where caregiver_id = :carer and rating = 4;
--   select rating_avg, rating_count from public.caregiver_profiles where user_id = :carer;
--   --> 3.00 | 2
--
--   -- DELETE both → avg null, count 0
--   delete from public.reviews where caregiver_id = :carer;
--   select rating_avg, rating_count from public.caregiver_profiles where user_id = :carer;
--   --> NULL | 0
-- ============================================================================
