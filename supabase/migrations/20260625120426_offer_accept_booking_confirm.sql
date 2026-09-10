-- SpecialCarers · Offer-accept now confirms the booking (gap 17 follow-up)
--
-- PR #72 created booking_match_offers as a parallel candidate layer that did
-- NOT touch bookings.caregiver_id (which was NOT NULL). This migration closes
-- the matching loop so that accepting an offer actually books the carer.
--
-- Hybrid behaviour (product decision):
--   • "Now" booking (starts within the next 60 min): FIRST-ACCEPT-WINS. The
--     first carer to accept is atomically written onto the booking; all other
--     pending offers are cancelled. Late accepters get result 'lost'.
--   • "Scheduled" booking (starts more than 60 min out): SEEKER-PICKS. Carers
--     accept (offer → 'accepted') and the seeker later confirms one of them.
--
-- Schema surgery this requires (deferred by PR #72, now in scope):
--   1. bookings.caregiver_id must allow NULL so a booking can exist pre-carer
--      while it is out for matching. Existing rows are unaffected.
--   2. bookings.confirmed_at timestamp to record when the carer was locked in.
--   3. booking_status enum gains 'confirmed'.
--   4. booking_match_offers.status CHECK widened with the new lifecycle states.

-- ── 1. bookings: allow a pre-confirmed booking to have no carer yet ──────────
alter table public.bookings
  alter column caregiver_id drop not null;

-- distinct-parties check must tolerate a null caregiver_id now.
alter table public.bookings
  drop constraint if exists bookings_distinct_parties;
alter table public.bookings
  add constraint bookings_distinct_parties
  check (caregiver_id is null or seeker_id <> caregiver_id);

alter table public.bookings
  add column if not exists confirmed_at timestamptz;

-- ── 2. booking_status enum: add 'confirmed' ─────────────────────────────────
-- ALTER TYPE … ADD VALUE cannot run inside a txn block alongside its later
-- use; isolate it in its own DO. Idempotent.
do $$ begin
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.booking_status'::regtype
      and enumlabel = 'confirmed'
  ) then
    alter type public.booking_status add value 'confirmed';
  end if;
end $$;

-- ── 3. Widen the offer status CHECK ─────────────────────────────────────────
-- Lifecycle: pending → accepted (seeker-pick) | accepted_and_confirmed
-- (winner) | lost (lost the now-race) | declined | expired | cancelled.
alter table public.booking_match_offers
  drop constraint if exists booking_match_offers_status_check;
alter table public.booking_match_offers
  add constraint booking_match_offers_status_check
  check (status in (
    'pending','accepted','declined','expired',
    'cancelled','accepted_and_confirmed','lost'
  ));

-- A reason for why an offer was cancelled (e.g. 'filled_by_other_carer').
alter table public.booking_match_offers
  add column if not exists cancel_reason text;

-- ── 4. RPC: accept_match_offer ──────────────────────────────────────────────
-- Carer accepts their own offer. SECURITY DEFINER so the carer can write the
-- booking row without a direct UPDATE grant on bookings. The "Now" path is a
-- single guarded UPDATE (caregiver_id IS NULL) that makes first-accept-wins
-- race-safe; the "Scheduled" path only flips the offer to 'accepted'.
create or replace function public.accept_match_offer(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_offer      public.booking_match_offers%rowtype;
  v_booking    public.bookings%rowtype;
  v_is_now     boolean;
  v_won        boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Lock the offer row for the duration of the txn.
  select * into v_offer
    from public.booking_match_offers
   where id = p_offer_id
     for update;

  if not found then
    raise exception 'offer not found';
  end if;
  if v_offer.carer_id <> v_uid then
    raise exception 'not your offer';
  end if;
  -- A carer can tap Accept on an offer that another carer just filled (their
  -- UI hasn't caught the Realtime cancel yet). Surface that as a friendly
  -- 'lost' rather than a generic invalid_state.
  if v_offer.status = 'cancelled'
     and v_offer.cancel_reason = 'filled_by_other_carer' then
    return jsonb_build_object('result', 'lost',
                              'booking_id', v_offer.booking_id,
                              'mode', 'now');
  end if;
  if v_offer.status <> 'pending' then
    return jsonb_build_object('result', 'invalid_state',
                              'status', v_offer.status);
  end if;
  if v_offer.expires_at < now() then
    update public.booking_match_offers
       set status = 'expired', responded_at = now()
     where id = v_offer.id;
    return jsonb_build_object('result', 'expired');
  end if;

  select * into v_booking
    from public.bookings
   where id = v_offer.booking_id
   for update;
  if not found then
    raise exception 'booking not found';
  end if;

  v_is_now := v_booking.starts_at <= now() + interval '60 minutes';

  if v_is_now then
    -- FIRST-ACCEPT-WINS: claim the booking only if no carer is locked in yet
    -- and it is still pre-confirmed. The caregiver_id IS NULL guard is the
    -- atomic race winner check.
    update public.bookings
       set caregiver_id = v_uid,
           status        = 'confirmed',
           confirmed_at  = now(),
           updated_at    = now()
     where id = v_offer.booking_id
       and caregiver_id is null
       and status in ('pending','pending_offer','offered');
    get diagnostics v_won = row_count;

    if not v_won then
      -- Lost the race (someone else already confirmed).
      update public.booking_match_offers
         set status = 'lost', responded_at = now()
       where id = v_offer.id;
      return jsonb_build_object('result', 'lost',
                                'booking_id', v_offer.booking_id,
                                'mode', 'now');
    end if;

    -- Winner: confirm this offer, cancel every other live offer.
    update public.booking_match_offers
       set status = 'accepted_and_confirmed', responded_at = now()
     where id = v_offer.id;

    update public.booking_match_offers
       set status        = 'cancelled',
           cancel_reason  = 'filled_by_other_carer',
           responded_at   = now()
     where booking_id = v_offer.booking_id
       and id <> v_offer.id
       and status in ('pending','accepted');

    return jsonb_build_object('result', 'instant_confirm',
                              'booking_id', v_offer.booking_id,
                              'mode', 'now');
  else
    -- SCHEDULED: the booking may already have been confirmed (seeker picked
    -- someone else, or it was cancelled). Don't record a stale acceptance.
    if v_booking.caregiver_id is not null
       or v_booking.status not in ('pending','pending_offer','offered') then
      update public.booking_match_offers
         set status        = 'lost',
             cancel_reason  = 'filled_by_other_carer',
             responded_at   = now()
       where id = v_offer.id;
      return jsonb_build_object('result', 'lost',
                                'booking_id', v_offer.booking_id,
                                'mode', 'scheduled');
    end if;
    -- Record the acceptance; seeker confirms later.
    update public.booking_match_offers
       set status = 'accepted', responded_at = now()
     where id = v_offer.id;
    return jsonb_build_object('result', 'pending_seeker_pick',
                              'booking_id', v_offer.booking_id,
                              'mode', 'scheduled');
  end if;
end;
$$;

grant execute on function public.accept_match_offer(uuid) to authenticated;

comment on function public.accept_match_offer(uuid) is
  'Carer accepts a match offer. Now-bookings: first-accept-wins (atomically confirms booking, cancels others). Scheduled: marks offer accepted for seeker pick.';

-- ── 5. RPC: seeker_pick_offer ───────────────────────────────────────────────
-- Seeker confirms one accepted offer on their own scheduled booking. Verifies
-- ownership, locks the carer in, and cancels the other live offers.
create or replace function public.seeker_pick_offer(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_offer   public.booking_match_offers%rowtype;
  v_booking public.bookings%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_offer
    from public.booking_match_offers
   where id = p_offer_id
   for update;
  if not found then
    raise exception 'offer not found';
  end if;

  select * into v_booking
    from public.bookings
   where id = v_offer.booking_id
   for update;
  if not found then
    raise exception 'booking not found';
  end if;

  -- Ownership: only the booking's seeker may pick.
  if v_booking.seeker_id <> v_uid then
    raise exception 'not your booking';
  end if;

  -- The chosen offer must be a live acceptance.
  if v_offer.status not in ('accepted','pending') then
    return jsonb_build_object('result', 'invalid_state',
                              'status', v_offer.status);
  end if;

  -- Booking must still be pre-confirmed.
  if v_booking.caregiver_id is not null
     or v_booking.status not in ('pending','pending_offer','offered') then
    return jsonb_build_object('result', 'already_confirmed',
                              'booking_id', v_booking.id);
  end if;

  update public.bookings
     set caregiver_id = v_offer.carer_id,
         status        = 'confirmed',
         confirmed_at  = now(),
         updated_at    = now()
   where id = v_booking.id;

  update public.booking_match_offers
     set status = 'accepted_and_confirmed', responded_at = now()
   where id = v_offer.id;

  update public.booking_match_offers
     set status        = 'cancelled',
         cancel_reason  = 'filled_by_other_carer',
         responded_at   = now()
   where booking_id = v_booking.id
     and id <> v_offer.id
     and status in ('pending','accepted');

  return jsonb_build_object('result', 'confirmed',
                            'booking_id', v_booking.id,
                            'carer_id', v_offer.carer_id,
                            'mode', 'scheduled');
end;
$$;

grant execute on function public.seeker_pick_offer(uuid) to authenticated;

comment on function public.seeker_pick_offer(uuid) is
  'Seeker confirms one accepted offer on their own scheduled booking. Locks the carer in and cancels the other live offers.';
