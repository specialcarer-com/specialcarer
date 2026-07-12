-- ============================================================================
-- SpecialCarers — Designated Payer v1 (gap 31)
--
-- A family/seeker can nominate a different adult in their household (e.g. an
-- adult child) to be billed for a booking. The bookee (seeker) and the payer
-- remain distinct. The nominated payer must be an active member of the
-- seeker's family (see 20260506_family_sharing.sql).
--
-- Column is nullable. NULL == legacy behaviour: the seeker pays. The billing
-- path only honours a non-NULL value when the FAMILY_DESIGNATED_PAYER_ENABLED
-- feature flag is on; with the flag off this column is ignored entirely.
-- ============================================================================

alter table public.bookings
  add column if not exists designated_payer_user_id uuid
    references auth.users(id) on delete set null;

create index if not exists bookings_designated_payer_user_idx
  on public.bookings(designated_payer_user_id)
  where designated_payer_user_id is not null;

comment on column public.bookings.designated_payer_user_id is
  'Designated Payer v1 (gap 31). Optional adult in the seeker''s household nominated to be billed instead of the seeker. NULL = seeker pays (legacy). Only honoured when FAMILY_DESIGNATED_PAYER_ENABLED is on.';
