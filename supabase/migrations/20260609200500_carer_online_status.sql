-- SpecialCarers · Carer go-online status (gap 18)
--
-- Lets carers mark themselves "Available now" so seekers can find them in
-- search and the auto-match algorithm can prefer live carers for "Now"
-- bookings.
--
--   * caregiver_profiles.is_online        — live availability flag
--   * caregiver_profiles.last_online_at    — last time they went online /
--                                            sent a heartbeat (drives the
--                                            30-min stale cutoff at read time)
--   * caregiver_profiles.online_radius_km  — willingness to travel while
--                                            online (1–20 km). Captured here;
--                                            consumed by the Smart Rerank work.
--
-- All additive + idempotent (caregiver_profiles is provisioned outside of
-- migrations, so we only ALTER ... ADD COLUMN IF NOT EXISTS).

-- ──────────────────────────────────────────────────────────────────
-- 1. Columns
-- ──────────────────────────────────────────────────────────────────

alter table public.caregiver_profiles
  add column if not exists is_online boolean not null default false,
  add column if not exists last_online_at timestamptz,
  add column if not exists online_radius_km integer not null default 5
    check (online_radius_km between 1 and 20);

comment on column public.caregiver_profiles.is_online is
  'Carer-controlled "Available now" flag. Combined with last_online_at > now() - 30 min to decide who is genuinely live.';
comment on column public.caregiver_profiles.last_online_at is
  'Last time the carer went online or sent a heartbeat. Reads treat is_online as stale after 30 minutes.';
comment on column public.caregiver_profiles.online_radius_km is
  'How far (km) the carer is willing to travel while online. 1–20, default 5. Used by search rerank + auto-match radius filter.';

-- ──────────────────────────────────────────────────────────────────
-- 2. Index for "who is online now" queries
-- ──────────────────────────────────────────────────────────────────

create index if not exists caregiver_profiles_online_idx
  on public.caregiver_profiles (is_online, last_online_at);

-- ──────────────────────────────────────────────────────────────────
-- 3. RLS — carer updates only their own row
-- ──────────────────────────────────────────────────────────────────
-- caregiver_profiles already has RLS enabled (provisioned outside
-- migrations). We add a narrowly-scoped self-update policy guarding the
-- new presence columns; the SECURITY DEFINER RPC below is the supported
-- write path, but this policy keeps direct writes safe too.

alter table public.caregiver_profiles enable row level security;

drop policy if exists "caregiver_profiles_self_presence_update"
  on public.caregiver_profiles;
create policy "caregiver_profiles_self_presence_update"
  on public.caregiver_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────
-- 4. RPC: set_carer_online_status
-- ──────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the carer can flip their own presence without a
-- direct table grant. Writes only the calling user's row. radius is
-- optional; when supplied it is clamped to the 1–20 km range.

create or replace function public.set_carer_online_status(
  p_online boolean,
  p_radius_km integer default null
)
returns table (
  is_online boolean,
  last_online_at timestamptz,
  online_radius_km integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_radius integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  v_radius := case
    when p_radius_km is null then null
    else greatest(1, least(20, p_radius_km))
  end;

  update public.caregiver_profiles cp
     set is_online = p_online,
         -- Going online (or heartbeating) refreshes the timestamp; going
         -- offline preserves the prior last_online_at so the UI can show
         -- "last seen".
         last_online_at = case when p_online then now() else cp.last_online_at end,
         online_radius_km = coalesce(v_radius, cp.online_radius_km)
   where cp.user_id = v_uid
   returning cp.is_online, cp.last_online_at, cp.online_radius_km
   into is_online, last_online_at, online_radius_km;

  if not found then
    raise exception 'no caregiver profile for current user';
  end if;

  return next;
end;
$$;

grant execute on function public.set_carer_online_status(boolean, integer)
  to authenticated;

comment on function public.set_carer_online_status(boolean, integer) is
  'Carer flips their own "Available now" presence (+ optional travel radius). SECURITY DEFINER; writes only the calling user''s caregiver_profiles row.';
