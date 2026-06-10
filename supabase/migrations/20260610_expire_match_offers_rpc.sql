-- SpecialCarers · Expire stale auto-match offers (gap 17 follow-up)
--
-- PR #72 (gap 17) created public.booking_match_offers with expires_at
-- populated by runAutoMatch (10 min for "Now", 1 hr for scheduled). Nothing
-- transitions those rows once the window passes, so they sit status='pending'
-- forever — polluting carer inboxes and seeker shortlists.
--
-- This RPC sweeps expired offers to status='expired'. It is driven by a
-- Vercel cron (see src/app/api/cron/expire-match-offers/route.ts).
--
-- Note: 'accepted' offers also expire. An accepted offer is only a soft signal
-- (it does NOT write bookings.caregiver_id — see PR #72 notes). If a scheduled
-- offer sat 'accepted' past its window without the seeker locking the carer in,
-- it's stale and should expire too.
--
-- SECURITY DEFINER + locked search_path so the cron's service-role client can
-- execute it without RLS getting in the way, and so the function body resolves
-- objects against a fixed schema set (no search_path hijacking).

-- Supporting index for the sweep predicate. PR #72 added
-- (carer_id, status, expires_at); this adds the (status, expires_at) prefix the
-- sweep actually filters on so it doesn't fall back to a scan as the table grows.
create index if not exists booking_match_offers_status_expires_idx
  on public.booking_match_offers (status, expires_at);

create or replace function public.expire_stale_match_offers()
returns table (expired_count int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  with expired as (
    update public.booking_match_offers
       set status = 'expired'
     where status in ('pending', 'accepted')
       and expires_at < now()
    returning 1
  )
  select count(*)::int into v_count from expired;

  expired_count := v_count;
  return next;
end;
$$;

-- Only the service-role cron client should call this. authenticated users have
-- no business mass-expiring offers, so we grant execute to service_role only.
revoke all on function public.expire_stale_match_offers() from public;
grant execute on function public.expire_stale_match_offers() to service_role;
