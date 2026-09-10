-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260503112454.
-- Ledger row: 20260503112454 stage3_trust_safety
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.blocked_caregivers (
  seeker_id uuid not null,
  caregiver_id uuid not null,
  reason text,
  created_at timestamp with time zone not null default now(),
  primary key (seeker_id, caregiver_id)
);

alter table public.blocked_caregivers enable row level security;

drop policy if exists "blocked_caregivers_owner_rw" on public.blocked_caregivers;
create policy "blocked_caregivers_owner_rw" on public.blocked_caregivers
  for all to authenticated
  using ((seeker_id = ( SELECT auth.uid() AS uid)))
  with check ((seeker_id = ( SELECT auth.uid() AS uid)));

create table if not exists public.safety_reports (
  id uuid not null default gen_random_uuid(),
  reporter_user_id uuid not null,
  booking_id uuid,
  subject_user_id uuid,
  report_type text not null,
  severity text not null,
  description text not null,
  evidence_urls text[] not null default ARRAY[]::text[],
  status text not null default 'open'::text,
  admin_notes text not null default ''::text,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  primary key (id)
);

alter table public.safety_reports enable row level security;

drop policy if exists "safety_reports_admin_update" on public.safety_reports;
create policy "safety_reports_admin_update" on public.safety_reports
  for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))));

drop policy if exists "safety_reports_reporter_insert" on public.safety_reports;
create policy "safety_reports_reporter_insert" on public.safety_reports
  for insert to authenticated
  with check ((reporter_user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists "safety_reports_reporter_select" on public.safety_reports;
create policy "safety_reports_reporter_select" on public.safety_reports
  for select to authenticated
  using (((reporter_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role))))));

