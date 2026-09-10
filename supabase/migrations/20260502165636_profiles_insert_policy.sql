-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260502165636.
-- Ledger row: 20260502165636 profiles_insert_policy
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Allow authenticated user to insert own profile row on sign-up.
drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());
