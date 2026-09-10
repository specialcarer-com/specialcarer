-- ============================================================================
-- SpecialCarer — Carer Founder Membership schema
--
-- A carer-side recurring subscription (£4.99/mo "Founder" tier) that unlocks
-- publishing a public marketplace profile. This is deliberately SEPARATE from
-- the consumer/family `public.subscriptions` table (plan tiers lite/plus/
-- premium): carers and families have different products, prices and lifecycle,
-- so we keep them in their own table to avoid overloading one schema with two
-- unrelated billing concepts.
--
-- Reconciliation is webhook-driven (checkout.session.completed +
-- customer.subscription.updated/deleted) against the same
-- /api/stripe/webhook endpoint that already verifies Stripe signatures.
-- Clients read their own row via RLS; all writes go through the service role.
-- ============================================================================

create table if not exists public.carer_memberships (
  id uuid primary key default gen_random_uuid(),
  carer_user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null check (status in ('active','past_due','canceled','incomplete','trialing')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One membership row per carer. Webhook upserts on this key so a re-subscribe
-- after cancellation updates the same row rather than accumulating history.
create unique index if not exists carer_memberships_user_idx
  on public.carer_memberships(carer_user_id);

create index if not exists carer_memberships_stripe_customer_idx
  on public.carer_memberships(stripe_customer_id);

-- updated_at trigger
create or replace function public.tg_carer_memberships_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists carer_memberships_set_updated_at on public.carer_memberships;
create trigger carer_memberships_set_updated_at
  before update on public.carer_memberships
  for each row execute function public.tg_carer_memberships_set_updated_at();

-- RLS — carers read their own row; all writes go through the service role
-- (webhook handler), which bypasses RLS.
alter table public.carer_memberships enable row level security;

drop policy if exists "carer reads own membership" on public.carer_memberships;
create policy "carer reads own membership" on public.carer_memberships
  for select using (auth.uid() = carer_user_id);

-- ----------------------------------------------------------------------------
-- is_active_carer_member(user_id) — single source of truth for publish gating.
--
-- Returns true iff the carer has a membership row with status='active' AND a
-- current_period_end strictly in the future. SECURITY DEFINER so it can be
-- called from RLS / policies / app code regardless of the caller's row-level
-- access to carer_memberships. Marked STABLE (reads now() + a table) so the
-- planner can cache it within a statement.
-- ----------------------------------------------------------------------------
create or replace function public.is_active_carer_member(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.carer_memberships m
    where m.carer_user_id = is_active_carer_member.user_id
      and m.status = 'active'
      and m.current_period_end is not null
      and m.current_period_end > now()
  );
$$;

grant execute on function public.is_active_carer_member(uuid) to authenticated, service_role;

comment on table public.carer_memberships is
  'Carer founder membership subscriptions (£4.99/mo). Separate from consumer subscriptions. Webhook-reconciled, RLS read-own.';
comment on function public.is_active_carer_member(uuid) is
  'True when the carer has an active membership whose current_period_end is in the future. Used to gate public profile publishing.';
