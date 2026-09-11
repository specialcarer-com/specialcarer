-- DBS-change allocation protection (Phase A / A4).
--
-- When a caregiver's DBS Update Service recheck returns "changed" the
-- existing recheck cron already:
--   * flips background_checks.status to 'failed'
--   * writes a dbs_change_events row
--   * pauses agency_opt_in_status
-- But it does not protect currently-allocated bookings against the
-- newly-untrusted carer. This migration adds:
--
--   1. bookings.dbs_protection_status / dbs_protection_change_event_id
--      to tag allocated bookings that need admin review or that were
--      auto-cancelled because they were already live.
--   2. bookings.dbs_protection_action_at / dbs_protection_reason so the
--      admin queue can order and explain protective actions.
--   3. safeguarding_alerts — new table that surfaces DBS-triggered
--      allocation events (and any future safeguarding categories) to
--      the admin dashboard with a dedupe key.
--
-- All operations are idempotent and additive so a re-run is a no-op.
-- Deployment is safe ahead of the code that reads these columns — the
-- code uses null-safe fallbacks and the protection cron short-circuits
-- when the table isn't yet present.

-- 1. Extend bookings with DBS-protection state ---------------------------

alter table public.bookings
  add column if not exists dbs_protection_status text,
  add column if not exists dbs_protection_change_event_id uuid,
  add column if not exists dbs_protection_action_at timestamptz,
  add column if not exists dbs_protection_reason text;

-- Enum-style check kept out-of-band so the ADD COLUMN stays idempotent;
-- the check is only added if it does not yet exist.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'bookings_dbs_protection_status_check'
       and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_dbs_protection_status_check
      check (
        dbs_protection_status is null
        or dbs_protection_status in (
          'pending_review',    -- admin decision required (accepted state)
          'auto_cancelled',    -- cron cancelled a paid or in-progress booking
          'cleared',           -- admin decided to keep the allocation
          'reallocated'        -- admin moved to a different carer
        )
      );
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'bookings_dbs_protection_change_event_fk'
       and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_dbs_protection_change_event_fk
      foreign key (dbs_protection_change_event_id)
      references public.dbs_change_events(id)
      on delete set null;
  end if;
end $$;

create index if not exists bookings_dbs_protection_pending_idx
  on public.bookings (dbs_protection_action_at desc)
  where dbs_protection_status = 'pending_review';

-- 2. safeguarding_alerts — durable admin queue ---------------------------

create table if not exists public.safeguarding_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('blocking','high','medium','info')),
  category text not null,
  booking_id uuid references public.bookings(id) on delete cascade,
  carer_id uuid references public.profiles(id) on delete cascade,
  seeker_id uuid references public.profiles(id) on delete cascade,
  related_event_id uuid,
  payload jsonb,
  admin_acknowledged_at timestamptz,
  admin_acknowledged_by uuid references public.profiles(id),
  admin_action text,
  admin_notes text,
  created_at timestamptz not null default now()
);

create index if not exists safeguarding_alerts_open_idx
  on public.safeguarding_alerts (severity, created_at desc)
  where admin_acknowledged_at is null;

-- Dedupe: at most one alert per (booking, dbs_change_event) tuple.
-- Prevents the protection cron from raising duplicate alerts on re-runs.
create unique index if not exists safeguarding_alerts_dedupe_idx
  on public.safeguarding_alerts (booking_id, related_event_id, category)
  where booking_id is not null and related_event_id is not null;

alter table public.safeguarding_alerts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where policyname = 'safeguarding_alerts_admin_read'
       and tablename = 'safeguarding_alerts'
  ) then
    create policy safeguarding_alerts_admin_read on public.safeguarding_alerts
      for select to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where policyname = 'safeguarding_alerts_admin_write'
       and tablename = 'safeguarding_alerts'
  ) then
    create policy safeguarding_alerts_admin_write on public.safeguarding_alerts
      for update to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      );
  end if;
end $$;
