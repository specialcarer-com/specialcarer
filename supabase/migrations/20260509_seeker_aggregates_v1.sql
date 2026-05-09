-- Seeker aggregates v1 — carer→seeker rating storage + read helpers
-- the carer-side detail screen uses to show pre-acceptance signal
-- about a client (rating average, completed-bookings count, repeat
-- client). Idempotent. RLS guards via pg_policies.policyname.

-- ── Carer-rates-seeker ratings ───────────────────────────────────
create table if not exists public.seeker_ratings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  seeker_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  tags text[] not null default '{}',
  private_note text check (length(coalesce(private_note,'')) <= 2000),
  created_at timestamptz not null default now(),
  unique (booking_id, caregiver_id)
);
create index if not exists seeker_ratings_seeker_idx
  on public.seeker_ratings (seeker_id);
create index if not exists seeker_ratings_carer_idx
  on public.seeker_ratings (caregiver_id);

alter table public.seeker_ratings enable row level security;

-- Carer can write/read their own ratings only. Seeker NEVER reads
-- individual rows — aggregate function below is the only path the
-- platform exposes seeker-side.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'seeker_ratings_carer_rw'
      and tablename = 'seeker_ratings'
  ) then
    create policy seeker_ratings_carer_rw on public.seeker_ratings
      for all to authenticated
      using (caregiver_id = (select auth.uid()))
      with check (caregiver_id = (select auth.uid()));
  end if;
end $$;

-- ── Aggregate read function ──────────────────────────────────────
-- Returns rating_avg / rating_count for a seeker, plus their global
-- completed-bookings stats. Light gate: the caller must have a
-- caregiver_profiles row (i.e. be a registered carer) or be an admin
-- — we don't want random authenticated seekers reading other seekers'
-- aggregates.
create or replace function public.get_seeker_aggregates(
  p_seeker_id uuid
)
returns table (
  rating_avg numeric,
  rating_count int,
  completed_bookings int,
  last_completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_carer boolean;
  v_is_admin boolean;
begin
  if v_uid is null then
    return;
  end if;

  select exists (
    select 1 from public.caregiver_profiles where user_id = v_uid
  ) into v_is_carer;
  select exists (
    select 1 from public.profiles where id = v_uid and role = 'admin'
  ) into v_is_admin;
  if not (v_is_carer or v_is_admin) then
    return;
  end if;

  return query
  with r as (
    select avg(rating)::numeric as rating_avg, count(*)::int as rating_count
    from public.seeker_ratings
    where seeker_id = p_seeker_id
  ),
  b as (
    select count(*)::int as completed_bookings,
           max(coalesce(shift_completed_at, ends_at)) as last_completed_at
    from public.bookings
    where seeker_id = p_seeker_id
      and status in ('completed','paid_out')
  )
  select r.rating_avg, r.rating_count, b.completed_bookings, b.last_completed_at
  from r, b;
end;
$$;

grant execute on function public.get_seeker_aggregates(uuid) to authenticated;

-- ── is_repeat_client(seeker, carer) ──────────────────────────────
-- True when the seeker has at least one historical completed booking
-- with the given carer (any prior booking — caller can fence on the
-- current booking id from the API if needed).
create or replace function public.is_repeat_client(
  p_seeker_id uuid,
  p_carer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings
    where seeker_id = p_seeker_id
      and caregiver_id = p_carer_id
      and status in ('completed','paid_out')
  );
$$;

grant execute on function public.is_repeat_client(uuid, uuid) to authenticated;
