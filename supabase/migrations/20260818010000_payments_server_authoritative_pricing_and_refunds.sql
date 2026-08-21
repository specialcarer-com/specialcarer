-- Server-authoritative booking pricing and Stripe refund reconciliation.
-- Existing rows are preserved; NOT VALID constraints protect all new writes
-- without failing this deploy on any historical data needing investigation.

alter table public.bookings
  add column if not exists client_request_id uuid,
  add column if not exists rate_version text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_refund_id text,
  add column if not exists refunded_amount_cents integer,
  add column if not exists refund_reason text,
  add column if not exists refunded_by_admin_id uuid references auth.users(id) on delete set null,
  add column if not exists refund_request_key text;

alter type public.booking_status add value if not exists 'partially_refunded';

create unique index if not exists bookings_client_request_id_unique
  on public.bookings (client_request_id)
  where client_request_id is not null;

create unique index if not exists bookings_stripe_refund_id_unique
  on public.bookings (stripe_refund_id)
  where stripe_refund_id is not null;

create unique index if not exists bookings_stripe_payment_intent_id_unique
  on public.bookings (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_total_cents_positive') then
    alter table public.bookings
      add constraint bookings_total_cents_positive check (total_cents > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_hours_positive') then
    alter table public.bookings
      add constraint bookings_hours_positive check (hours > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_hourly_rate_cents_positive') then
    alter table public.bookings
      add constraint bookings_hourly_rate_cents_positive check (hourly_rate_cents > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_refunded_amount_cents_positive') then
    alter table public.bookings
      add constraint bookings_refunded_amount_cents_positive
      check (refunded_amount_cents is null or refunded_amount_cents > 0) not valid;
  end if;
end $$;
