-- Earnings v1 — referral codes, referrals tracking, payout intents,
-- and read-side RPCs for the carer earnings dashboard. Idempotent.
-- All RLS guards use pg_policies.policyname.

-- ── Referral fields on caregiver_profiles ────────────────────────
alter table public.caregiver_profiles
  add column if not exists referral_code text;
alter table public.caregiver_profiles
  add column if not exists referred_by uuid
    references auth.users(id) on delete set null;

-- Backfill deterministic 6-char codes for any existing carer that
-- doesn't have one yet.
update public.caregiver_profiles
  set referral_code = upper(substring(md5(user_id::text), 1, 6))
  where referral_code is null;

-- One unique code per carer once backfilled.
do $$ begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'caregiver_profiles_referral_code_key'
  ) then
    create unique index caregiver_profiles_referral_code_key
      on public.caregiver_profiles (referral_code)
      where referral_code is not null;
  end if;
end $$;

-- ── Referrals tracking ───────────────────────────────────────────
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referee_id uuid not null references auth.users(id) on delete cascade,
  code_used text not null,
  qualifying_bookings int not null default 0,
  payout_status text not null default 'pending'
    check (payout_status in ('pending','qualified','paid','void')),
  paid_out_at timestamptz,
  created_at timestamptz not null default now(),
  unique (referee_id)
);
create index if not exists referrals_referrer_idx
  on public.referrals (referrer_id);
create index if not exists referrals_referee_idx
  on public.referrals (referee_id);

alter table public.referrals enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'referrals_self_read'
      and tablename = 'referrals'
  ) then
    create policy referrals_self_read on public.referrals
      for select to authenticated
      using (
        referrer_id = (select auth.uid())
        or referee_id = (select auth.uid())
      );
  end if;
end $$;

-- ── Payout intents ───────────────────────────────────────────────
create table if not exists public.payout_intents (
  id uuid primary key default gen_random_uuid(),
  carer_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('instant','weekly','manual')),
  amount_cents integer not null check (amount_cents > 0),
  fee_cents integer not null default 0,
  currency text not null check (currency in ('gbp','usd')),
  stripe_payout_id text,
  status text not null default 'requested'
    check (status in ('requested','processing','paid','failed','cancelled')),
  failure_reason text,
  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payout_intents_carer_requested_idx
  on public.payout_intents (carer_id, requested_at desc);
create index if not exists payout_intents_status_kind_idx
  on public.payout_intents (status, kind);
create index if not exists payout_intents_stripe_id_idx
  on public.payout_intents (stripe_payout_id)
  where stripe_payout_id is not null;

alter table public.payout_intents enable row level security;

-- Carer can read own. All inserts/updates flow through service-role
-- routes; no carer-side write policy.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'payout_intents_self_read'
      and tablename = 'payout_intents'
  ) then
    create policy payout_intents_self_read on public.payout_intents
      for select to authenticated
      using (carer_id = (select auth.uid()));
  end if;
end $$;

-- ── Earnings summary RPC ─────────────────────────────────────────
create or replace function public.carer_earnings_summary(
  p_carer uuid,
  p_currency text default 'gbp'
)
returns table (
  today_cents bigint,
  week_cents bigint,
  month_cents bigint,
  year_cents bigint,
  lifetime_cents bigint,
  tips_today_cents bigint,
  tips_week_cents bigint,
  tips_month_cents bigint,
  tips_year_cents bigint,
  completed_bookings_this_week int,
  last_payout_at timestamptz,
  available_balance_cents bigint,
  currency text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_now timestamptz := now();
  v_today_start timestamptz := date_trunc('day', v_now);
  v_week_start timestamptz := date_trunc('week', v_now);
  v_month_start timestamptz := date_trunc('month', v_now);
  v_year_start timestamptz := date_trunc('year', v_now);
  v_curr text := lower(coalesce(p_currency, 'gbp'));
begin
  if v_uid is null then
    return;
  end if;
  select exists (
    select 1 from public.profiles where id = v_uid and role = 'admin'
  ) into v_is_admin;
  if v_uid <> p_carer and not v_is_admin then
    return;
  end if;

  return query
  with shift_earn as (
    select
      coalesce(sum(case when shift_completed_at >= v_today_start then subtotal_cents else 0 end), 0) as today_cents,
      coalesce(sum(case when shift_completed_at >= v_week_start then subtotal_cents else 0 end), 0) as week_cents,
      coalesce(sum(case when shift_completed_at >= v_month_start then subtotal_cents else 0 end), 0) as month_cents,
      coalesce(sum(case when shift_completed_at >= v_year_start then subtotal_cents else 0 end), 0) as year_cents,
      coalesce(sum(subtotal_cents), 0) as lifetime_cents,
      coalesce(count(*) filter (where shift_completed_at >= v_week_start), 0)::int as completed_bookings_this_week
    from public.bookings
    where caregiver_id = p_carer
      and lower(currency) = v_curr
      and status in ('completed','paid_out')
  ),
  tip_earn as (
    select
      coalesce(sum(case when succeeded_at >= v_today_start then amount_cents else 0 end), 0) as tips_today_cents,
      coalesce(sum(case when succeeded_at >= v_week_start then amount_cents else 0 end), 0) as tips_week_cents,
      coalesce(sum(case when succeeded_at >= v_month_start then amount_cents else 0 end), 0) as tips_month_cents,
      coalesce(sum(case when succeeded_at >= v_year_start then amount_cents else 0 end), 0) as tips_year_cents
    from public.tips
    where caregiver_id = p_carer
      and lower(currency) = upper(v_curr)
      and status = 'succeeded'
  ),
  available as (
    select coalesce(sum(subtotal_cents), 0) as bal
    from public.bookings
    where caregiver_id = p_carer
      and lower(currency) = v_curr
      and status = 'completed'
      and payout_eligible_at is not null
      and payout_eligible_at <= v_now
      and paid_out_at is null
  ),
  last_payout as (
    select max(paid_out_at) as last_payout_at
    from public.bookings
    where caregiver_id = p_carer
      and lower(currency) = v_curr
      and paid_out_at is not null
  )
  select
    s.today_cents::bigint,
    s.week_cents::bigint,
    s.month_cents::bigint,
    s.year_cents::bigint,
    s.lifetime_cents::bigint,
    t.tips_today_cents::bigint,
    t.tips_week_cents::bigint,
    t.tips_month_cents::bigint,
    t.tips_year_cents::bigint,
    s.completed_bookings_this_week,
    lp.last_payout_at,
    a.bal::bigint as available_balance_cents,
    v_curr
  from shift_earn s, tip_earn t, available a, last_payout lp;
end;
$$;

grant execute on function public.carer_earnings_summary(uuid, text)
  to authenticated;

-- ── Streak (consecutive trailing weeks with ≥3 completed bookings) ─
create or replace function public.carer_streak_weeks(p_carer uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_streak int := 0;
  v_offset int := 0;
  v_week_start timestamptz;
  v_count int;
begin
  loop
    v_week_start := date_trunc('week', now()) - (v_offset || ' weeks')::interval;
    select count(*) into v_count
    from public.bookings
    where caregiver_id = p_carer
      and status in ('completed','paid_out')
      and shift_completed_at >= v_week_start
      and shift_completed_at < v_week_start + interval '1 week';
    if v_count >= 3 then
      v_streak := v_streak + 1;
      v_offset := v_offset + 1;
    else
      exit;
    end if;
    if v_offset > 104 then exit; end if; -- 2-year safety bound
  end loop;
  return v_streak;
end;
$$;

grant execute on function public.carer_streak_weeks(uuid) to authenticated;
