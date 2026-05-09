-- Coverage cities v3.11 — public marketing data for the city availability
-- map at /coverage and the per-city pages at /coverage/[slug]. Anon-readable.
-- Idempotent: tables/triggers/policies guarded by IF NOT EXISTS or
-- pg_policies.policyname checks.
--
-- The file is split into two clearly labelled chunks so the parent agent
-- can apply DDL (Schema) and DML (Seed) separately if desired.

-- ════════════════════════════════════════════════════════════════════
-- ── Schema ──────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.coverage_cities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(slug) between 1 and 80),
  name text not null,
  country text not null check (country in ('UK','US')),
  region text,
  lat numeric(8,4) not null,
  lng numeric(9,4) not null,
  status text not null check (status in ('live','waitlist','coming_soon')),
  carer_count integer not null default 0,
  avg_response_min integer,
  verticals text[] not null default '{}',
  timezone text,
  launched_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coverage_cities_country_status_idx
  on public.coverage_cities (country, status);
-- (slug already has a unique index from the column-level UNIQUE constraint.)

alter table public.coverage_cities enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'coverage_cities_public_select'
      and tablename = 'coverage_cities'
  ) then
    create policy coverage_cities_public_select on public.coverage_cities
      for select to anon, authenticated
      using (true);
  end if;
end $$;

-- updated_at trigger.
create or replace function public.coverage_cities_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'coverage_cities_touch_trg'
  ) then
    create trigger coverage_cities_touch_trg
      before update on public.coverage_cities
      for each row execute function public.coverage_cities_touch();
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- ── Seed ────────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════════
-- 25 cities seeded with `on conflict (slug) do nothing` so re-runs are
-- safe and never overwrite later admin edits to carer_count, etc.
--
-- Vertical IDs (5): elderly_care, childcare, special_needs, postnatal,
-- complex_care.
-- Mock metrics: carer_count 40–280 (London highest), avg_response 8–25
-- (smaller cities slower), launched_at within 2024-01-01 .. 2026-01-01.

insert into public.coverage_cities
  (slug, name, country, region, lat, lng, status, carer_count,
   avg_response_min, verticals, timezone, launched_at)
values
  -- ─── LIVE UK (12) ─────────────────────────────────────────────────
  ('london-uk', 'London', 'UK', 'England', 51.5074, -0.1278,
    'live', 280, 8,
    array['elderly_care','childcare','special_needs','postnatal','complex_care'],
    'Europe/London', date '2024-01-15'),
  ('manchester-uk', 'Manchester', 'UK', 'England', 53.4808, -2.2426,
    'live', 165, 11,
    array['elderly_care','childcare','special_needs','postnatal','complex_care'],
    'Europe/London', date '2024-03-04'),
  ('birmingham-uk', 'Birmingham', 'UK', 'England', 52.4862, -1.8904,
    'live', 142, 12,
    array['elderly_care','childcare','special_needs','postnatal','complex_care'],
    'Europe/London', date '2024-04-22'),
  ('leeds-uk', 'Leeds', 'UK', 'England', 53.8008, -1.5491,
    'live', 96, 14,
    array['elderly_care','childcare','special_needs','postnatal'],
    'Europe/London', date '2024-06-10'),
  ('glasgow-uk', 'Glasgow', 'UK', 'Scotland', 55.8642, -4.2518,
    'live', 110, 13,
    array['elderly_care','childcare','special_needs','postnatal','complex_care'],
    'Europe/London', date '2024-07-08'),
  ('edinburgh-uk', 'Edinburgh', 'UK', 'Scotland', 55.9533, -3.1883,
    'live', 88, 14,
    array['elderly_care','childcare','special_needs','postnatal'],
    'Europe/London', date '2024-09-02'),
  ('liverpool-uk', 'Liverpool', 'UK', 'England', 53.4084, -2.9916,
    'live', 78, 16,
    array['elderly_care','childcare','special_needs','complex_care'],
    'Europe/London', date '2024-10-14'),
  ('bristol-uk', 'Bristol', 'UK', 'England', 51.4545, -2.5879,
    'live', 84, 15,
    array['elderly_care','childcare','postnatal','complex_care'],
    'Europe/London', date '2024-11-05'),
  ('sheffield-uk', 'Sheffield', 'UK', 'England', 53.3811, -1.4701,
    'live', 62, 18,
    array['elderly_care','childcare','special_needs'],
    'Europe/London', date '2025-01-20'),
  ('newcastle-uk', 'Newcastle', 'UK', 'England', 54.9783, -1.6178,
    'live', 56, 19,
    array['elderly_care','childcare','complex_care'],
    'Europe/London', date '2025-03-03'),
  ('cardiff-uk', 'Cardiff', 'UK', 'Wales', 51.4816, -3.1791,
    'live', 52, 20,
    array['elderly_care','childcare','postnatal'],
    'Europe/London', date '2025-04-21'),
  ('belfast-uk', 'Belfast', 'UK', 'Northern Ireland', 54.5973, -5.9301,
    'live', 44, 22,
    array['elderly_care','childcare','complex_care'],
    'Europe/London', date '2025-06-09'),

  -- ─── LIVE US (8) ──────────────────────────────────────────────────
  ('new-york-us', 'New York', 'US', 'New York', 40.7128, -74.0060,
    'live', 240, 9,
    array['elderly_care','childcare','special_needs','postnatal','complex_care'],
    'America/New_York', date '2024-02-12'),
  ('los-angeles-us', 'Los Angeles', 'US', 'California', 34.0522, -118.2437,
    'live', 195, 11,
    array['elderly_care','childcare','special_needs','postnatal','complex_care'],
    'America/Los_Angeles', date '2024-04-08'),
  ('chicago-us', 'Chicago', 'US', 'Illinois', 41.8781, -87.6298,
    'live', 138, 12,
    array['elderly_care','childcare','special_needs','postnatal','complex_care'],
    'America/Chicago', date '2024-06-24'),
  ('san-francisco-us', 'San Francisco', 'US', 'California', 37.7749, -122.4194,
    'live', 122, 11,
    array['elderly_care','childcare','special_needs','postnatal','complex_care'],
    'America/Los_Angeles', date '2024-08-19'),
  ('boston-us', 'Boston', 'US', 'Massachusetts', 42.3601, -71.0589,
    'live', 92, 14,
    array['elderly_care','childcare','special_needs','postnatal'],
    'America/New_York', date '2024-10-07'),
  ('washington-dc-us', 'Washington, DC', 'US', 'District of Columbia',
    38.9072, -77.0369,
    'live', 80, 15,
    array['elderly_care','childcare','special_needs','postnatal'],
    'America/New_York', date '2024-11-18'),
  ('seattle-us', 'Seattle', 'US', 'Washington', 47.6062, -122.3321,
    'live', 70, 17,
    array['elderly_care','childcare','postnatal','complex_care'],
    'America/Los_Angeles', date '2025-02-10'),
  ('austin-us', 'Austin', 'US', 'Texas', 30.2672, -97.7431,
    'live', 64, 18,
    array['elderly_care','childcare','special_needs','postnatal'],
    'America/Chicago', date '2025-04-14'),

  -- ─── WAITLIST UK (5) ──────────────────────────────────────────────
  ('nottingham-uk', 'Nottingham', 'UK', 'England', 52.9548, -1.1581,
    'waitlist', 0, null,
    array['elderly_care','childcare','special_needs','postnatal','complex_care'],
    'Europe/London', null),
  ('southampton-uk', 'Southampton', 'UK', 'England', 50.9097, -1.4044,
    'waitlist', 0, null,
    array['elderly_care','childcare','special_needs','postnatal','complex_care'],
    'Europe/London', null),
  ('brighton-uk', 'Brighton', 'UK', 'England', 50.8225, -0.1372,
    'waitlist', 0, null,
    array['elderly_care','childcare','special_needs','postnatal','complex_care'],
    'Europe/London', null),
  ('aberdeen-uk', 'Aberdeen', 'UK', 'Scotland', 57.1497, -2.0943,
    'waitlist', 0, null,
    array['elderly_care','childcare','special_needs','postnatal','complex_care'],
    'Europe/London', null),
  ('cambridge-uk', 'Cambridge', 'UK', 'England', 52.2053, 0.1218,
    'waitlist', 0, null,
    array['elderly_care','childcare','special_needs','postnatal','complex_care'],
    'Europe/London', null)
on conflict (slug) do nothing;
