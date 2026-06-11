-- SpecialCarer · Real response_rate + completion_rate for the matching loop
--
-- The weighted match scorer (gap 17 auto-match / gap 19 rerank, PRs #71-73)
-- folds two track-record signals into a carer's match strength:
--
--   response_rate   15%  share of recent offers the carer acted on
--   completion_rate  5%  share of confirmed bookings the carer completed
--
-- Until now both fell back to defaults: response_rate was recomputed inline
-- on every auto-match (a per-request scan of booking_match_offers) and
-- completion_rate was proxied via caregiver_stats.on_time_rate. This migration
-- makes both real and cheap to read.
--
-- Pattern (Option A): a view is the source of truth; a materialised companion
-- table is what the matching loop reads.
--
--   caregiver_rates_v      — computes both rates per carer on the fly.
--   caregiver_rates_cache  — table (carer_id PK) the matching loop reads.
--   refresh_caregiver_rates() — upserts the view into the cache (daily cron).
--
-- We use a plain table + upsert (not a MATERIALIZED VIEW) so the daily cron
-- can refresh it incrementally/idempotently and so new carers with no history
-- simply have no row (the matching loop falls back to its existing default).
--
-- Formulae (see PR body for the deviation note vs. the brief):
--   response_rate   = (accepted-or-rejected offers) / (offers sent)
--                     over a trailing 30 days. A non-response (offer expired
--                     with no action) counts to the denominator only.
--   completion_rate = (completed bookings) / (completed + cancelled bookings)
--                     over a trailing 90 days. Matches the precedent already
--                     encoded in src/lib/ai/matching.ts — this codebase has no
--                     cancelled_by column, so "cancellations by the seeker
--                     before start" cannot be isolated; all cancellations sit
--                     in the denominator. Range 0..1.

-- ──────────────────────────────────────────────────────────────────
-- 1. Source-of-truth view
-- ──────────────────────────────────────────────────────────────────

create or replace view public.caregiver_rates_v as
with response as (
  -- Offers sent to a carer in the trailing 30 days. "Acted on" = the carer
  -- accepted or declined (accepted / accepted_and_confirmed / declined). A
  -- 'lost' offer (another carer filled it first) is excluded entirely — the
  -- carer was never given a real chance to respond. 'cancelled' (filled by
  -- another carer) is likewise excluded. 'expired'/'pending' count as a
  -- non-response: denominator only.
  select
    o.carer_id,
    count(*) filter (
      where o.status in ('accepted', 'accepted_and_confirmed', 'declined')
    )::numeric as responded,
    count(*) filter (
      where o.status in (
        'accepted', 'accepted_and_confirmed', 'declined', 'expired'
      )
    )::numeric as offered
  from public.booking_match_offers o
  where o.offered_at >= now() - interval '30 days'
  group by o.carer_id
),
completion as (
  -- Confirmed-or-beyond bookings in the trailing 90 days. Numerator =
  -- bookings that reached a completed state; denominator = completed +
  -- cancelled. Bookings still in flight (confirmed/in_progress/paid) are
  -- excluded from both until they resolve, so an active carer isn't
  -- penalised for shifts that simply haven't happened yet.
  select
    b.caregiver_id,
    count(*) filter (
      where b.status in ('completed', 'paid_out')
    )::numeric as completed,
    count(*) filter (
      where b.status in ('completed', 'paid_out', 'cancelled')
    )::numeric as resolved
  from public.bookings b
  where b.caregiver_id is not null
    and b.starts_at >= now() - interval '90 days'
  group by b.caregiver_id
),
carers as (
  select r.carer_id from response r
  union
  select c.caregiver_id from completion c
)
select
  k.carer_id,
  case
    when coalesce(r.offered, 0) = 0 then null
    else round(r.responded / r.offered, 4)
  end as response_rate,
  case
    when coalesce(c.resolved, 0) = 0 then null
    else round(c.completed / c.resolved, 4)
  end as completion_rate,
  coalesce(r.offered, 0)::int  as offers_sent,
  coalesce(r.responded, 0)::int as offers_responded,
  coalesce(c.resolved, 0)::int as bookings_resolved,
  coalesce(c.completed, 0)::int as bookings_completed
from carers k
left join response r   on r.carer_id = k.carer_id
left join completion c on c.caregiver_id = k.carer_id;

comment on view public.caregiver_rates_v is
  'Source of truth for per-carer response_rate (30d) and completion_rate (90d). The matching loop reads the materialised caregiver_rates_cache, refreshed daily from this view via refresh_caregiver_rates().';

-- ──────────────────────────────────────────────────────────────────
-- 2. Materialised companion table (what the matching loop reads)
-- ──────────────────────────────────────────────────────────────────

create table if not exists public.caregiver_rates_cache (
  carer_id uuid primary key references auth.users(id) on delete cascade,
  -- 0..1, NULL when the carer has no offers / no resolved bookings in window.
  response_rate numeric(5,4),
  completion_rate numeric(5,4),
  computed_at timestamptz not null default now(),
  constraint caregiver_rates_response_range
    check (response_rate is null or (response_rate >= 0 and response_rate <= 1)),
  constraint caregiver_rates_completion_range
    check (completion_rate is null or (completion_rate >= 0 and completion_rate <= 1))
);

comment on table public.caregiver_rates_cache is
  'Materialised per-carer response_rate + completion_rate read by the auto-match scorer (gap 17). Refreshed daily by /api/cron/refresh-caregiver-rates. Source of truth: caregiver_rates_v. Missing row => matching loop uses its neutral default.';

alter table public.caregiver_rates_cache enable row level security;
-- Read-only public signal (mirrors caregiver_stats); writes go through the
-- service-role client / SECURITY DEFINER refresh function only.
grant select on public.caregiver_rates_cache to anon, authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 3. Refresh function — recompute from the view, upsert into the cache.
--    SECURITY DEFINER so the daily cron (service role) and an ops call can
--    both run it. Idempotent: re-running just rewrites current values.
-- ──────────────────────────────────────────────────────────────────

create or replace function public.refresh_caregiver_rates()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  insert into public.caregiver_rates_cache
    (carer_id, response_rate, completion_rate, computed_at)
  select v.carer_id, v.response_rate, v.completion_rate, now()
  from public.caregiver_rates_v v
  on conflict (carer_id) do update
    set response_rate   = excluded.response_rate,
        completion_rate = excluded.completion_rate,
        computed_at     = excluded.computed_at;
  get diagnostics v_updated = row_count;

  -- Drop rows for carers who have aged entirely out of both windows, so the
  -- cache doesn't pin stale rates forever.
  delete from public.caregiver_rates_cache c
  where not exists (
    select 1 from public.caregiver_rates_v v where v.carer_id = c.carer_id
  );

  return v_updated;
end;
$$;

comment on function public.refresh_caregiver_rates() is
  'Recompute caregiver_rates_v and upsert into caregiver_rates_cache; prune carers no longer in window. Returns rows upserted. Called daily by /api/cron/refresh-caregiver-rates.';

grant execute on function public.refresh_caregiver_rates() to service_role;

-- ──────────────────────────────────────────────────────────────────
-- 4. One-shot backfill on deploy.
--    Single statement is fine at current scale (< 5000 carers). The refresh
--    function itself is the batch unit; if the carer base grows past that,
--    swap this for a chunked loop (see PR follow-up note).
-- ──────────────────────────────────────────────────────────────────

select public.refresh_caregiver_rates();
