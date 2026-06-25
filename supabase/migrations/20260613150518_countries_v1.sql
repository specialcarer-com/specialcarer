-- Country feature-flag table (multi-country framework, step 1).
--
-- Context:
--   SpecialCarers is UK-only today. This is the *foundation* for turning on
--   additional countries (Ireland, US re-entry, EU) later without a code
--   change for the basic "is this country live?" question. It is deliberately
--   minimal: a feature-flag row per country plus an admin UI.
--
--   Per-country currency/tax/compliance business logic stays hardcoded for now
--   (everything is GBP per the 2026-06 GBP migration). The forward-compat slots
--   below (currency_code, default_locale, …) exist so that adding tax_rate,
--   postcode_regex, compliance_vendor, etc. later is a column-add migration,
--   not a redesign.
--
--   Idempotent: create-if-not-exists throughout; the GB seed uses
--   `on conflict (code) do nothing` so re-runs are no-ops.

create table if not exists public.countries (
  code text primary key,                                   -- ISO 3166-1 alpha-2, e.g. 'GB'
  name text not null,                                      -- display name
  flag_emoji text,                                         -- e.g. '🇬🇧' (nullable)
  enabled_for_signup boolean not null default false,       -- appears in signup country dropdown
  enabled_for_search boolean not null default false,       -- postcodes accepted by find-care search
  currency_code text not null default 'GBP',               -- ISO 4217 forward-compat slot
  default_locale text not null default 'en-GB',            -- future locale routing
  display_order integer not null default 100,              -- ordering in dropdowns
  notes text,                                              -- admin notes (nullable)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Shared updated_at trigger fn (matches tg_set_updated_at used elsewhere).
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_set_updated_at'
  ) then
    create function public.tg_set_updated_at()
    returns trigger language plpgsql as $f$
    begin
      new.updated_at = now();
      return new;
    end;
    $f$;
  end if;
end$$;

drop trigger if exists countries_set_updated_at on public.countries;
create trigger countries_set_updated_at
  before update on public.countries
  for each row execute function public.tg_set_updated_at();

-- Index for the common dropdown ordering (display_order, name).
create index if not exists countries_display_order_idx
  on public.countries (display_order, name);

-- RLS ------------------------------------------------------------------------
alter table public.countries enable row level security;

-- SELECT: any authenticated user (so the signup country dropdown works).
drop policy if exists "countries select authenticated" on public.countries;
create policy "countries select authenticated" on public.countries
  for select
  to authenticated
  using (true);

-- INSERT/UPDATE/DELETE: admins only (profiles.role = 'admin'), matching the
-- admin-write pattern used by other admin-managed tables.
drop policy if exists "countries admin insert" on public.countries;
create policy "countries admin insert" on public.countries
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

drop policy if exists "countries admin update" on public.countries;
create policy "countries admin update" on public.countries
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

drop policy if exists "countries admin delete" on public.countries;
create policy "countries admin delete" on public.countries
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

-- Seed exactly ONE row: United Kingdom, live for both signup and search.
-- Other countries are enabled deliberately by an admin, not pre-seeded.
insert into public.countries
  (code, name, flag_emoji, enabled_for_signup, enabled_for_search,
   currency_code, default_locale, display_order)
values
  ('GB', 'United Kingdom', '🇬🇧', true, true, 'GBP', 'en-GB', 1)
on conflict (code) do nothing;
