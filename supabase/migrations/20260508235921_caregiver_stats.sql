-- SpecialCarer · Caregiver track-record stats
--
-- Adds three trust signals to caregiver profiles:
--   - repeat_client_rate : % of distinct clients who booked >=2 times
--   - response_time_minutes : median minutes from booking creation to
--     caregiver accept/decline (only requests the carer responded to)
--   - on_time_rate : % of completed shifts where the carer arrived
--     within 5 minutes of starts_at (industry-standard threshold)
--
-- Statistics stay hidden until a caregiver has at least 5 completed
-- bookings — this avoids misleading 0% / 100% from a tiny sample.
--
-- Implementation notes:
--   * We add three timestamp columns to public.bookings so future
--     transitions record the precise moment a carer responded /
--     arrived. Existing rows get NULLs; the view skips NULLs in its
--     median + percentage calculations.
--   * The materialised view caregiver_stats is refreshed on demand
--     by /api/cron/refresh-stats (additive). It's a MATERIALIZED VIEW
--     (not a regular view) so reads from the browse list and profile
--     pages stay fast even at scale.

-- ──────────────────────────────────────────────────────────────────
-- 1. Booking lifecycle timestamps (additive)
-- ──────────────────────────────────────────────────────────────────

alter table public.bookings
  add column if not exists accepted_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists actual_started_at timestamptz;

comment on column public.bookings.accepted_at is
  'When the caregiver accepted the booking request. NULL until accepted.';
comment on column public.bookings.declined_at is
  'When the caregiver declined the booking request. NULL unless declined.';
comment on column public.bookings.actual_started_at is
  'When the caregiver actually started the shift (vs. scheduled starts_at). Used for on-time metric.';

create index if not exists idx_bookings_caregiver_accepted
  on public.bookings (caregiver_id, accepted_at)
  where accepted_at is not null;

create index if not exists idx_bookings_caregiver_completed
  on public.bookings (caregiver_id, status, shift_completed_at)
  where status = 'completed';

-- ──────────────────────────────────────────────────────────────────
-- 2. Materialised view: caregiver_stats
-- ──────────────────────────────────────────────────────────────────

drop materialized view if exists public.caregiver_stats cascade;

create materialized view public.caregiver_stats as
with completed as (
  -- Source set: completed (or paid_out) shifts with both seeker_id +
  -- shift_completed_at known. Excludes cancellations, refunds, disputes.
  select
    b.caregiver_id,
    b.seeker_id,
    b.starts_at,
    b.actual_started_at,
    b.shift_completed_at
  from public.bookings b
  where b.caregiver_id is not null
    and b.seeker_id is not null
    and b.shift_completed_at is not null
    and b.status in ('completed', 'paid_out')
),
completed_counts as (
  select caregiver_id, count(*)::int as completed_bookings
  from completed
  group by caregiver_id
),
repeat_clients as (
  -- Distinct clients who booked the same carer 2+ times.
  select caregiver_id,
         count(*) filter (where bookings_count >= 2)::int as repeat_clients,
         count(*)::int as total_clients
  from (
    select caregiver_id, seeker_id, count(*) as bookings_count
    from completed
    group by caregiver_id, seeker_id
  ) per_client
  group by caregiver_id
),
response_times as (
  -- Response time = minutes from booking creation to first
  -- accept/decline. Caps at 7 days to ignore truly stale rows.
  select b.caregiver_id,
         percentile_cont(0.5) within group (
           order by extract(epoch from (
             coalesce(b.accepted_at, b.declined_at) - b.created_at
           )) / 60.0
         ) as median_response_minutes,
         count(*) filter (
           where b.accepted_at is not null or b.declined_at is not null
         )::int as responded_count
  from public.bookings b
  where b.caregiver_id is not null
    and (b.accepted_at is not null or b.declined_at is not null)
    and coalesce(b.accepted_at, b.declined_at) > b.created_at
    and coalesce(b.accepted_at, b.declined_at)
        < b.created_at + interval '7 days'
  group by b.caregiver_id
),
on_time as (
  -- On-time rule: actual_started_at within 5 minutes after starts_at.
  -- Early arrivals also count as on-time. Only counts shifts where
  -- actual_started_at was recorded (legacy NULL rows are excluded).
  select c.caregiver_id,
         count(*) filter (
           where c.actual_started_at <= c.starts_at + interval '5 minutes'
         )::int as on_time_count,
         count(*)::int as tracked_count
  from completed c
  where c.actual_started_at is not null
  group by c.caregiver_id
)
select
  cc.caregiver_id,
  cc.completed_bookings,
  -- repeat_client_rate: 0..1, NULL when no completed clients.
  case
    when coalesce(rc.total_clients, 0) = 0 then null
    else round(rc.repeat_clients::numeric / rc.total_clients::numeric, 4)
  end as repeat_client_rate,
  rc.repeat_clients,
  rc.total_clients,
  -- median response in whole minutes (rounded). NULL if no responses.
  case
    when rt.median_response_minutes is null then null
    else round(rt.median_response_minutes)::int
  end as response_time_minutes,
  rt.responded_count,
  -- on_time_rate: 0..1. NULL until tracked shifts exist.
  case
    when coalesce(ot.tracked_count, 0) = 0 then null
    else round(ot.on_time_count::numeric / ot.tracked_count::numeric, 4)
  end as on_time_rate,
  ot.on_time_count,
  ot.tracked_count as on_time_tracked,
  now() as refreshed_at
from completed_counts cc
left join repeat_clients rc using (caregiver_id)
left join response_times rt using (caregiver_id)
left join on_time ot using (caregiver_id);

create unique index caregiver_stats_caregiver_id_idx
  on public.caregiver_stats (caregiver_id);

comment on materialized view public.caregiver_stats is
  'Per-caregiver trust signals — repeat-client rate, median response time, on-time rate. Refresh via refresh_caregiver_stats(). Stats display threshold is 5 completed_bookings (enforced at the API layer).';

-- ──────────────────────────────────────────────────────────────────
-- 3. RLS — anyone can read stats (public profile data)
-- ──────────────────────────────────────────────────────────────────

-- Materialised views inherit no RLS, so we grant explicit read.
grant select on public.caregiver_stats to anon, authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 4. Refresh helper — concurrent (won't block reads) + safe to retry.
--    Called from /api/cron/refresh-stats and after booking transitions.
-- ──────────────────────────────────────────────────────────────────

create or replace function public.refresh_caregiver_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Concurrent refresh requires a unique index (we created one above).
  refresh materialized view concurrently public.caregiver_stats;
exception
  when others then
    -- Concurrent refresh fails on first run when the view is empty.
    -- Fall back to a regular refresh in that edge case.
    refresh materialized view public.caregiver_stats;
end;
$$;

grant execute on function public.refresh_caregiver_stats() to authenticated;
