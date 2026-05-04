-- ============================================================================
-- SpecialCarer — Stripe Connect schema
-- Bookings, payments (escrow), and caregiver Stripe Connect accounts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Caregiver Stripe Connect accounts
-- One row per caregiver who has started/completed Stripe onboarding.
-- ----------------------------------------------------------------------------
create table if not exists public.caregiver_stripe_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_account_id text not null unique,                -- acct_xxx
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  country text,                                          -- 'GB' or 'US'
  default_currency text,                                 -- 'gbp' or 'usd'
  requirements_currently_due jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists caregiver_stripe_accounts_user_idx
  on public.caregiver_stripe_accounts(user_id);

alter table public.caregiver_stripe_accounts enable row level security;

drop policy if exists "owner can read own stripe account"
  on public.caregiver_stripe_accounts;
create policy "owner can read own stripe account"
  on public.caregiver_stripe_accounts for select
  using (auth.uid() = user_id);

-- writes happen server-side only (service role bypasses RLS)

-- ----------------------------------------------------------------------------
-- 2. Bookings
-- A request from a seeker (family) for a caregiver to perform a shift.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type booking_status as enum (
      'pending',         -- seeker requested, awaiting caregiver acceptance
      'accepted',        -- caregiver accepted, awaiting payment
      'paid',            -- payment authorized & held in escrow
      'in_progress',     -- shift currently happening
      'completed',       -- shift finished, awaiting payout window
      'paid_out',        -- caregiver received funds
      'cancelled',       -- cancelled before shift
      'refunded',        -- payment refunded to seeker
      'disputed'         -- under dispute
    );
  end if;
end$$;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references auth.users(id) on delete restrict,
  caregiver_id uuid not null references auth.users(id) on delete restrict,
  status booking_status not null default 'pending',

  -- shift details
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  hours numeric(6,2) not null,
  hourly_rate_cents integer not null,                    -- per-hour rate (smallest currency unit)
  subtotal_cents integer not null,                       -- hours * rate
  platform_fee_cents integer not null,                   -- platform fee at booking time (currently 30% of subtotal)
  total_cents integer not null,                          -- subtotal + platform_fee
  currency text not null check (currency in ('gbp','usd')),

  -- service description
  service_type text not null,                            -- 'childcare' | 'elderly' | 'home_support' etc
  notes text,

  -- location (rough — full address goes in a separate addresses table later)
  location_city text,
  location_country text check (location_country in ('GB','US')),

  -- timestamps
  paid_at timestamptz,
  shift_completed_at timestamptz,
  payout_eligible_at timestamptz,                        -- shift_completed_at + 24h
  paid_out_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bookings_time_order check (ends_at > starts_at),
  constraint bookings_distinct_parties check (seeker_id <> caregiver_id)
);

create index if not exists bookings_seeker_idx on public.bookings(seeker_id);
create index if not exists bookings_caregiver_idx on public.bookings(caregiver_id);
create index if not exists bookings_status_idx on public.bookings(status);
create index if not exists bookings_payout_eligible_idx
  on public.bookings(payout_eligible_at) where status = 'completed';

alter table public.bookings enable row level security;

drop policy if exists "parties can read own bookings" on public.bookings;
create policy "parties can read own bookings"
  on public.bookings for select
  using (auth.uid() = seeker_id or auth.uid() = caregiver_id);

-- writes happen via server actions (service role)

-- ----------------------------------------------------------------------------
-- 3. Payments
-- One row per Stripe PaymentIntent, linked to a booking.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum (
      'requires_payment_method',
      'requires_confirmation',
      'requires_action',
      'processing',
      'requires_capture',          -- authorized, held in escrow
      'succeeded',                 -- captured + transferred to caregiver
      'cancelled',
      'refunded',
      'partially_refunded',
      'failed'
    );
  end if;
end$$;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  stripe_payment_intent_id text not null unique,         -- pi_xxx
  stripe_charge_id text,                                 -- ch_xxx (after capture)
  stripe_transfer_id text,                               -- tr_xxx (after capture/transfer)
  status payment_status not null,
  amount_cents integer not null,
  application_fee_cents integer not null,
  currency text not null,
  destination_account_id text not null,                  -- caregiver's acct_xxx
  raw jsonb,                                             -- full PI payload from latest webhook
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_booking_idx on public.payments(booking_id);
create index if not exists payments_pi_idx on public.payments(stripe_payment_intent_id);

alter table public.payments enable row level security;

drop policy if exists "parties can read own payments" on public.payments;
create policy "parties can read own payments"
  on public.payments for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = payments.booking_id
        and (auth.uid() = b.seeker_id or auth.uid() = b.caregiver_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Stripe webhook events log (idempotency)
-- ----------------------------------------------------------------------------
create table if not exists public.stripe_webhook_events (
  id text primary key,                                   -- evt_xxx (Stripe event id)
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_type_idx
  on public.stripe_webhook_events(type);
create index if not exists stripe_webhook_events_unprocessed_idx
  on public.stripe_webhook_events(created_at) where processed_at is null;

-- service role only
alter table public.stripe_webhook_events enable row level security;

-- ----------------------------------------------------------------------------
-- 5. updated_at triggers
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_caregiver_stripe_accounts_updated_at
  on public.caregiver_stripe_accounts;
create trigger set_caregiver_stripe_accounts_updated_at
  before update on public.caregiver_stripe_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists set_bookings_updated_at on public.bookings;
create trigger set_bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();
