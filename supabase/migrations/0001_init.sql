-- SpecialCarer · Initial schema
-- Apply in Supabase SQL editor for the carelink-dev project.
-- Safe to run multiple times.

-- =========================================
-- 1. WAITLIST (public site signups)
-- =========================================
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text,
  locale text default 'en-GB',
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Allow anonymous inserts (the public homepage)
drop policy if exists "anon can join waitlist" on public.waitlist;
create policy "anon can join waitlist"
  on public.waitlist for insert
  to anon
  with check (true);

-- Nobody (anon or authenticated) can read the waitlist via the API.
-- Service-role bypasses RLS; admin tools should use the service-role key server-side.

-- =========================================
-- 2. PROFILES (app users — seekers, caregivers, admins)
-- Mirrors auth.users with role + display info.
-- =========================================
create type if not exists public.user_role as enum ('seeker', 'caregiver', 'admin');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'seeker',
  full_name text,
  phone text,
  locale text default 'en-GB',
  country text check (country in ('GB','US')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "users see own profile" on public.profiles;
create policy "users see own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
