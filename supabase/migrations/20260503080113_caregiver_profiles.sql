-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260503080113.
-- Ledger row: 20260503080113 caregiver_profiles
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.caregiver_profiles (
  user_id uuid not null,
  display_name text,
  headline text,
  bio text,
  city text,
  region text,
  country text,
  services text[] not null default '{}'::text[],
  hourly_rate_cents integer,
  currency text default 'GBP'::text,
  years_experience integer,
  languages text[] not null default '{}'::text[],
  max_radius_km integer,
  photo_url text,
  is_published boolean not null default false,
  rating_avg numeric,
  rating_count integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  care_formats text[] not null default '{}'::text[],
  weekly_rate_cents integer,
  gender text,
  has_drivers_license boolean not null default false,
  has_own_vehicle boolean not null default false,
  tags text[] not null default '{}'::text[],
  certifications text[] not null default '{}'::text[],
  postcode text,
  home_point geography,
  hide_precise_location boolean not null default true,
  referral_code text,
  referred_by uuid,
  application_stage caregiver_application_stage not null default 'applied'::caregiver_application_stage,
  stage_entered_at timestamp with time zone not null default now(),
  public_slug text,
  is_online boolean not null default false,
  last_online_at timestamp with time zone,
  online_radius_km integer not null default 5,
  home_lat double precision,
  home_lng double precision,
  dbs_overall_status text default 'not_started'::text,
  dbs_search_eligible boolean default false,
  verified_status text not null default 'pending'::text,
  verified_at timestamp with time zone,
  verified_reason text,
  home_geog geography default (extensions.st_setsrid(extensions.st_makepoint(home_lng, home_lat), 4326))::extensions.geography,
  primary key (user_id)
);

alter table public.caregiver_profiles enable row level security;

drop policy if exists "admins read all caregiver_profiles" on public.caregiver_profiles;
create policy "admins read all caregiver_profiles" on public.caregiver_profiles
  for select to public
  using (is_admin(auth.uid()));

drop policy if exists "caregiver inserts own profile" on public.caregiver_profiles;
create policy "caregiver inserts own profile" on public.caregiver_profiles
  for insert to public
  with check ((auth.uid() = user_id));

drop policy if exists "caregiver reads own profile" on public.caregiver_profiles;
create policy "caregiver reads own profile" on public.caregiver_profiles
  for select to public
  using ((auth.uid() = user_id));

drop policy if exists "caregiver updates own profile" on public.caregiver_profiles;
create policy "caregiver updates own profile" on public.caregiver_profiles
  for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

drop policy if exists "caregiver_profiles_self_presence_update" on public.caregiver_profiles;
create policy "caregiver_profiles_self_presence_update" on public.caregiver_profiles
  for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

drop policy if exists "public reads published profiles" on public.caregiver_profiles;
create policy "public reads published profiles" on public.caregiver_profiles
  for select to public
  using ((is_published = true));

