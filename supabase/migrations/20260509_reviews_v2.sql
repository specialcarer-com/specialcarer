-- Reviews v2: category sub-ratings + tags + private feedback,
-- plus tips (0% platform fee) and seeker block-list.

-- ── Reviews: category ratings + tags ─────────────────────────────
alter table public.reviews
  add column if not exists rating_punctuality int
    check (rating_punctuality between 1 and 5);
alter table public.reviews
  add column if not exists rating_communication int
    check (rating_communication between 1 and 5);
alter table public.reviews
  add column if not exists rating_care_quality int
    check (rating_care_quality between 1 and 5);
alter table public.reviews
  add column if not exists rating_cleanliness int
    check (rating_cleanliness between 1 and 5);
alter table public.reviews
  add column if not exists tags text[] not null default '{}';

-- ── Private feedback to platform ─────────────────────────────────
create table if not exists public.review_private_feedback (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id),
  unique(booking_id, reviewer_id)
);
alter table public.review_private_feedback enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'review_private_feedback_owner_rw'
      and tablename = 'review_private_feedback'
  ) then
    create policy review_private_feedback_owner_rw
      on public.review_private_feedback
      for all to authenticated
      using (reviewer_id = (select auth.uid()))
      with check (reviewer_id = (select auth.uid()));
  end if;
end $$;

-- ── Tips (Stripe top-up after booking, 0% platform fee) ──────────
create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  payer_id uuid not null references auth.users(id) on delete cascade,
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  currency text not null check (currency in ('GBP','USD')),
  stripe_payment_intent_id text,
  status text not null default 'created'
    check (status in ('created','succeeded','failed','refunded')),
  created_at timestamptz not null default now(),
  succeeded_at timestamptz
);
create index if not exists tips_caregiver_idx on public.tips(caregiver_id);
create index if not exists tips_booking_idx on public.tips(booking_id);
alter table public.tips enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'tips_self_read' and tablename = 'tips'
  ) then
    create policy tips_self_read on public.tips
      for select to authenticated
      using (
        payer_id = (select auth.uid())
        or caregiver_id = (select auth.uid())
      );
  end if;
end $$;

-- ── Seeker block list ────────────────────────────────────────────
create table if not exists public.blocked_caregivers (
  seeker_id uuid not null references auth.users(id) on delete cascade,
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (seeker_id, caregiver_id)
);
alter table public.blocked_caregivers enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'blocked_caregivers_owner_rw'
      and tablename = 'blocked_caregivers'
  ) then
    create policy blocked_caregivers_owner_rw
      on public.blocked_caregivers
      for all to authenticated
      using (seeker_id = (select auth.uid()))
      with check (seeker_id = (select auth.uid()));
  end if;
end $$;
