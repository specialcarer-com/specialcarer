-- Admin Ops v3.12 — split chunk for ledger alignment.
-- Original bundle: supabase/migrations/20260509_admin_ops_v3_12.sql
-- Split at logical Gap boundaries; all sub-files remain idempotent.
--
-- Contains Gap 3 (marketplace ops heatmap + surge) schema and demo seed.

-- ─── Gap 3: Marketplace ops heatmap + auto-surge ────────────────────
create table if not exists public.marketplace_demand_snapshots (
  id uuid primary key default gen_random_uuid(),
  taken_at timestamptz not null default now(),
  city_slug text not null,
  vertical text not null,
  demand_score numeric(8,2) not null default 0,
  supply_score numeric(8,2) not null default 0,
  fill_rate numeric(4,3) not null default 0
    check (fill_rate >= 0 and fill_rate <= 1),
  hour_of_day int not null check (hour_of_day between 0 and 23)
);
create index if not exists marketplace_demand_snapshots_when_idx
  on public.marketplace_demand_snapshots(taken_at desc);
create index if not exists marketplace_demand_snapshots_city_vertical_idx
  on public.marketplace_demand_snapshots(city_slug, vertical, taken_at desc);

alter table public.marketplace_demand_snapshots enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'demand_snapshots_admin_select'
      and tablename = 'marketplace_demand_snapshots'
  ) then
    create policy demand_snapshots_admin_select
      on public.marketplace_demand_snapshots
      for select to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;

create table if not exists public.surge_rules (
  id uuid primary key default gen_random_uuid(),
  city_slug text not null,
  vertical text not null,
  condition_jsonb jsonb not null default '{}',
  multiplier numeric(3,2) not null default 1.30
    check (multiplier >= 1.00 and multiplier <= 1.50),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists surge_rules_city_vertical_idx
  on public.surge_rules(city_slug, vertical);

alter table public.surge_rules enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'surge_rules_admin_all'
      and tablename = 'surge_rules'
  ) then
    create policy surge_rules_admin_all on public.surge_rules
      for all to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      )
      with check (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;

create table if not exists public.surge_events (
  id uuid primary key default gen_random_uuid(),
  city_slug text not null,
  vertical text not null,
  multiplier numeric(3,2) not null
    check (multiplier >= 1.00 and multiplier <= 1.50),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  reason text,
  rule_id uuid references public.surge_rules(id) on delete set null
);
create index if not exists surge_events_active_idx
  on public.surge_events(city_slug, vertical) where ended_at is null;
create index if not exists surge_events_started_idx
  on public.surge_events(started_at desc);

alter table public.surge_events enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'surge_events_admin_all'
      and tablename = 'surge_events'
  ) then
    create policy surge_events_admin_all on public.surge_events
      for all to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      )
      with check (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;


-- ─── Gap 3 demo snapshots: 6 rows across London/NYC/Manchester. ─────
insert into public.marketplace_demand_snapshots
  (taken_at, city_slug, vertical, demand_score, supply_score,
   fill_rate, hour_of_day)
select v.* from (values
  (now() - interval '1 hour', 'london-uk', 'elderly_care',
    24.0, 12.0, 0.55, extract(hour from now() - interval '1 hour')::int),
  (now() - interval '2 hour', 'london-uk', 'childcare',
    18.0, 16.0, 0.78, extract(hour from now() - interval '2 hour')::int),
  (now() - interval '1 hour', 'new-york-us', 'elderly_care',
    22.0, 9.0, 0.51, extract(hour from now() - interval '1 hour')::int),
  (now() - interval '1 hour', 'new-york-us', 'special_needs',
    8.0, 10.0, 0.85, extract(hour from now() - interval '1 hour')::int),
  (now() - interval '3 hour', 'manchester-uk', 'postnatal',
    6.0, 5.0, 0.72, extract(hour from now() - interval '3 hour')::int),
  (now() - interval '1 hour', 'manchester-uk', 'complex_care',
    11.0, 4.0, 0.45, extract(hour from now() - interval '1 hour')::int)
) as v(taken_at, city_slug, vertical, demand_score, supply_score,
       fill_rate, hour_of_day)
where not exists (
  select 1 from public.marketplace_demand_snapshots
);

