-- ============================================================================
-- SpecialCarer — Memberships schema
-- Subscriptions table + plan_tier + interval enums + RLS.
--
-- Design notes:
-- - One ACTIVE subscription per user. Past subscriptions are kept for
--   history (status='canceled' or 'past_due'). The "current plan" query
--   picks the row with status IN ('active','trialing','past_due') ordered
--   by created_at desc.
-- - `source` distinguishes Stripe-paid subs from admin "comp" grants
--   (founder members, partnerships, support credits) — comps have no
--   stripe_subscription_id and never get charged, but enjoy the same
--   plan-aware perks.
-- - Booking-flow gating reads from this table server-side only; clients
--   read /api/memberships/me to display state. Direct client SELECT is
--   allowed only for the user's own row.
-- ============================================================================

-- 1. Plan tiers + billing intervals + subscription statuses
do $$
begin
  if not exists (select 1 from pg_type where typname = 'membership_plan') then
    create type membership_plan as enum (
      'lite',
      'plus',
      'premium'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'membership_interval') then
    create type membership_interval as enum (
      'month',
      'year'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'membership_status') then
    -- Mirrors Stripe's subscription.status values + a 'comp' value for
    -- admin-granted complimentary memberships.
    create type membership_status as enum (
      'active',
      'trialing',
      'past_due',
      'canceled',
      'unpaid',
      'incomplete',
      'incomplete_expired',
      'paused',
      'comp'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'membership_source') then
    create type membership_source as enum (
      'stripe',     -- normal paid Stripe subscription
      'comp',       -- admin-granted complimentary (no charge)
      'partner'     -- bulk grant from a B2B partner / employer benefit
    );
  end if;
end$$;

-- 2. Subscriptions table
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  plan membership_plan not null,
  billing_interval membership_interval,                  -- null for comp/partner
  status membership_status not null,
  source membership_source not null default 'stripe',

  -- Stripe linkage (null for comp/partner)
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,

  -- Period bookkeeping
  current_period_start timestamptz,
  current_period_end timestamptz,                        -- null for indefinite comp
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,

  -- Audit
  granted_by uuid references auth.users(id) on delete set null,  -- for comp/partner
  grant_reason text,                                     -- for comp/partner
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_idx
  on public.subscriptions(user_id);

create index if not exists subscriptions_user_active_idx
  on public.subscriptions(user_id, status)
  where status in ('active','trialing','past_due','comp');

create index if not exists subscriptions_stripe_customer_idx
  on public.subscriptions(stripe_customer_id);

-- updated_at trigger
create or replace function public.tg_subscriptions_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.tg_subscriptions_set_updated_at();

-- 3. RLS — users read own; all writes go through service role
alter table public.subscriptions enable row level security;

drop policy if exists "owner can read own subscriptions"
  on public.subscriptions;
create policy "owner can read own subscriptions"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for authenticated users — service role
-- (used by webhook handler + admin API) bypasses RLS.

-- 4. Helper view: current active plan per user (server-side use)
create or replace view public.user_current_plan as
select distinct on (s.user_id)
  s.user_id,
  s.plan,
  s.status,
  s.source,
  s.billing_interval,
  s.current_period_end,
  s.cancel_at_period_end,
  s.id as subscription_id
from public.subscriptions s
where s.status in ('active','trialing','past_due','comp')
order by s.user_id,
  -- prefer active > trialing > comp > past_due
  case s.status
    when 'active' then 1
    when 'trialing' then 2
    when 'comp' then 3
    when 'past_due' then 4
    else 5
  end asc,
  s.created_at desc;

-- View inherits permissions from underlying table; no extra grants needed.
comment on view public.user_current_plan is
  'Single active membership row per user. Use server-side only.';

comment on table public.subscriptions is
  'Membership subscriptions. One active row per user via partial index. Stripe-paid + admin comp grants live here together.';
