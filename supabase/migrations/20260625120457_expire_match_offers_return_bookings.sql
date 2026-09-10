-- SpecialCarers · Expire stale match offers — return affected bookings
--
-- PR #75 (gap 17 follow-up) shipped expire_stale_match_offers() returning only
-- table(expired_count int). That was enough to flip rows, but the cron had no
-- way to notify anyone: we punted on the push because the data wasn't in scope
-- and DispatchEvent had no 'offer.expired' variant.
--
-- This redefines the RPC to return one row PER AFFECTED BOOKING:
--   booking_id, seeker_id, expired_count (offers expired on that booking),
--   shortlisted_carer_ids (the carers whose offers just expired — cheap, the
--   sweep already touches those rows).
--
-- The cron (src/app/api/cron/expire-match-offers/route.ts) sums expired_count
-- across rows for its log line and dispatches one 'offer.expired' push to each
-- distinct seeker. Notifying the shortlisted carers is left as a follow-up; the
-- ids ride along on the event payload so a later PR can wire it without another
-- migration.
--
-- SECURITY DEFINER + locked search_path unchanged (service-role cron only).

-- Drop the old single-row signature; CREATE OR REPLACE can't change the
-- return type in place.
drop function if exists public.expire_stale_match_offers();

create function public.expire_stale_match_offers()
returns table (
  booking_id uuid,
  seeker_id uuid,
  expired_count int,
  shortlisted_carer_ids uuid[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with expired as (
    update public.booking_match_offers o
       set status = 'expired'
     where o.status in ('pending', 'accepted')
       and o.expires_at < now()
    returning o.booking_id, o.carer_id
  )
  select
    e.booking_id,
    b.seeker_id,
    count(*)::int as expired_count,
    array_agg(e.carer_id) as shortlisted_carer_ids
  from expired e
  join public.bookings b on b.id = e.booking_id
  group by e.booking_id, b.seeker_id;
end;
$$;

-- Only the service-role cron client should call this.
revoke all on function public.expire_stale_match_offers() from public;
grant execute on function public.expire_stale_match_offers() to service_role;
