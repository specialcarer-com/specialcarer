-- Admin Ops v3.12 — split chunk for ledger alignment.
-- Original bundle: supabase/migrations/20260509_admin_ops_v3_12.sql
-- Split at logical Gap boundaries; all sub-files remain idempotent.
--
-- Contains Gap 8 (analytics KPI rollups) schema and rollup seed.

-- ─── Gap 8: Analytics KPI rollups ───────────────────────────────────
create table if not exists public.kpi_rollups_daily (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  metric text not null check (metric in
    ('bookings','gmv','nps','repeat_rate','fill_rate','time_to_match_min')),
  dimension jsonb not null default '{}',
  -- Composite uniqueness via the md5 of the dimension as a deterministic
  -- text fingerprint. Keeps one row per (day, metric, dimension) shape.
  dimension_hash text not null
    generated always as (md5(dimension::text)) stored,
  value numeric(14,4) not null default 0,
  computed_at timestamptz not null default now(),
  unique (day, metric, dimension_hash)
);
create index if not exists kpi_rollups_daily_metric_day_idx
  on public.kpi_rollups_daily(metric, day desc);

alter table public.kpi_rollups_daily enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'kpi_rollups_admin_select'
      and tablename = 'kpi_rollups_daily'
  ) then
    create policy kpi_rollups_admin_select on public.kpi_rollups_daily
      for select to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;


-- ─── Gap 8: 14 days × 6 metrics × 1 dimension key (national rollup). ─
-- We seed deterministic, plausible values so the dashboard isn't
-- empty when an admin first visits.
do $$
declare
  d date;
  m text;
  v numeric;
  bookings_base numeric := 320;
  gmv_base numeric := 14_500.00;
begin
  if (select count(*) from public.kpi_rollups_daily) > 0 then
    return; -- idempotent — don't re-seed.
  end if;
  for i in 0..13 loop
    d := current_date - i;
    foreach m in array array[
      'bookings','gmv','nps','repeat_rate','fill_rate','time_to_match_min'
    ] loop
      v := case m
        when 'bookings' then bookings_base + ((13 - i) * 7) + (i % 3) * 4
        when 'gmv' then gmv_base + ((13 - i) * 320.0) + (i % 5) * 75.0
        when 'nps' then 48 + (i % 4)::numeric
        when 'repeat_rate' then 0.34 + ((i % 5) * 0.01)
        when 'fill_rate' then 0.78 + ((i % 4) * 0.015)
        when 'time_to_match_min' then 18 - (i % 3)::numeric
      end;
      insert into public.kpi_rollups_daily (day, metric, dimension, value)
        values (d, m, '{"scope":"national"}'::jsonb, v)
        on conflict (day, metric, dimension_hash) do nothing;
    end loop;
  end loop;
end $$;
