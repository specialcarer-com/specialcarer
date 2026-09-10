-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260502101127.
-- Ledger row: 20260502101127 init_waitlist_profiles
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.waitlist (
  id uuid not null default gen_random_uuid(),
  email text not null,
  source text,
  locale text default 'en-GB'::text,
  created_at timestamp with time zone not null default now(),
  feature text,
  primary key (id)
);

alter table public.waitlist enable row level security;

-- Anonymous inserts (public homepage waitlist).
drop policy if exists "anon can join waitlist" on public.waitlist;
create policy "anon can join waitlist" on public.waitlist
  for insert to anon
  with check (true);

-- Initial profiles table (columns are additively extended by later migrations).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'seeker',
  full_name text,
  phone text,
  locale text default 'en-GB',
  country text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
alter table public.profiles enable row level security;

-- Owner can read + update own profile.
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (id = auth.uid());
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
