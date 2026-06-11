-- Calendar export V1 (gap 40): .ics download + personal calendar feed.
--
-- Two columns are added:
--   1. bookings.ics_sequence  — RFC 5545 SEQUENCE. Calendar clients only
--      refresh an already-imported event when SEQUENCE increases, so this
--      must be bumped whenever a booking's time/location/status changes.
--   2. profiles.calendar_token — a per-user opaque token used in the public
--      webcal feed URL. NOT the session cookie (calendar clients won't carry
--      it). Nullable: feed is disabled until the user opts in, and can be
--      disabled again by nulling it. Rotating = generating a fresh value.

alter table public.bookings
  add column if not exists ics_sequence integer not null default 0;

comment on column public.bookings.ics_sequence is
  'RFC 5545 SEQUENCE for calendar export (gap 40). Increment on any change to '
  'starts_at / ends_at / location / status so subscribed calendar clients '
  'refresh the event.';

alter table public.profiles
  add column if not exists calendar_token uuid;

-- One token per user; lookups in the public feed route hit this unique index.
create unique index if not exists profiles_calendar_token_key
  on public.profiles(calendar_token)
  where calendar_token is not null;

comment on column public.profiles.calendar_token is
  'Opaque per-user token for the private webcal feed (gap 40). Null = feed '
  'disabled. Generated on first "set up calendar sync", rotated to invalidate '
  'the old URL, nulled to disable. Used by GET /api/calendar/feed/[token].ics.';
