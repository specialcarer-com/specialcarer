-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260503102455.
-- Ledger row: 20260503102455 admin_audit_log
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.admin_audit_log (
  id bigint not null,
  admin_id uuid not null,
  admin_email text,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamp with time zone not null default now(),
  primary key (id)
);

alter table public.admin_audit_log enable row level security;

drop policy if exists "admins read audit log" on public.admin_audit_log;
create policy "admins read audit log" on public.admin_audit_log
  for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));

