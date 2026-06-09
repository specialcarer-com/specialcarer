-- SpecialCarers · Auto-match candidate offers (gap 17)
--
-- When a seeker's Now/Schedule booking needs carers, the auto-match
-- algorithm computes the top 5 candidates and writes them here as
-- candidate offers. Carers respond accept/decline; seekers watch the
-- cards update live over Realtime.
--
-- This is a parallel candidate layer keyed by booking_id. It does NOT
-- mutate bookings.caregiver_id (which is NOT NULL in this schema) — the
-- existing booking-acceptance flow remains the single writer of that
-- column. An accepted offer is the signal ops/automation use to lock a
-- carer in; wiring that mutation is deferred (see PR notes).

create table if not exists public.booking_match_offers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  carer_id uuid not null references auth.users(id) on delete cascade,
  -- 0..100 match score (whole-number friendly for display).
  score numeric not null default 0 check (score >= 0 and score <= 100),
  -- Per-signal contributions for explainability, e.g.
  -- { "distance": 0.8, "rating": 0.9, "response_rate": 0.7, ... }.
  score_breakdown jsonb not null default '{}'::jsonb,
  offered_at timestamptz not null default now(),
  responded_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','expired')),
  -- "Now" bookings expire in 10 min; scheduled in 1 hr (set by the writer).
  expires_at timestamptz not null,
  decline_reason text,
  created_at timestamptz not null default now(),
  -- One offer per carer per booking.
  unique (booking_id, carer_id)
);

comment on table public.booking_match_offers is
  'Top-N auto-match candidate offers for a booking (gap 17). Carers respond; seekers watch live. Does not write bookings.caregiver_id.';

create index if not exists booking_match_offers_booking_score_idx
  on public.booking_match_offers (booking_id, score desc);
create index if not exists booking_match_offers_carer_status_idx
  on public.booking_match_offers (carer_id, status, expires_at);

-- ──────────────────────────────────────────────────────────────────
-- RLS
--   * Seeker sees offers on their own bookings (SELECT).
--   * Carer sees their own offers (SELECT).
--   * Carer updates only their own offer's status + responded_at.
--   * Inserts happen via the service-role admin client (auto-match), which
--     bypasses RLS — so no INSERT policy is granted to end users.
-- ──────────────────────────────────────────────────────────────────

alter table public.booking_match_offers enable row level security;

drop policy if exists "match_offers_seeker_read" on public.booking_match_offers;
create policy "match_offers_seeker_read"
  on public.booking_match_offers for select
  using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_match_offers.booking_id
         and b.seeker_id = auth.uid()
    )
  );

drop policy if exists "match_offers_carer_read" on public.booking_match_offers;
create policy "match_offers_carer_read"
  on public.booking_match_offers for select
  using (carer_id = auth.uid());

drop policy if exists "match_offers_carer_respond" on public.booking_match_offers;
create policy "match_offers_carer_respond"
  on public.booking_match_offers for update
  using (carer_id = auth.uid())
  with check (carer_id = auth.uid());

-- Add to the Realtime publication so seeker + carer UIs receive live
-- offer changes (accept/decline/expire). Guarded for idempotency.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'booking_match_offers'
  ) then
    alter publication supabase_realtime add table public.booking_match_offers;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- RPC: booking_origin_point
--   Returns the booking's service_point as lng/lat so the auto-match
--   library can feed it to caregivers_within_radius without dealing with
--   PostGIS geometry on the TS side. SECURITY DEFINER + locked search_path.
-- ──────────────────────────────────────────────────────────────────

create or replace function public.booking_origin_point(p_booking_id uuid)
returns table (lng double precision, lat double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select extensions.ST_X(b.service_point::extensions.geometry) as lng,
         extensions.ST_Y(b.service_point::extensions.geometry) as lat
    from public.bookings b
   where b.id = p_booking_id
     and b.service_point is not null;
$$;

grant execute on function public.booking_origin_point(uuid)
  to authenticated, service_role;

