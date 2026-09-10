-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260506143637.
-- Ledger row: 20260506143637 20260506_family_sharing_uniques
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Add UNIQUE constraints to family sharing tables.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='family_members')
     and not exists (select 1 from pg_constraint where conname = 'family_members_family_user_uniq') then
    alter table public.family_members
      add constraint family_members_family_user_uniq unique (family_id, user_id);
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='family_invites')
     and not exists (select 1 from pg_constraint where conname = 'family_invites_token_uniq') then
    alter table public.family_invites
      add constraint family_invites_token_uniq unique (token);
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='families')
     and not exists (select 1 from pg_constraint where conname = 'families_primary_user_uniq') then
    alter table public.families
      add constraint families_primary_user_uniq unique (primary_user_id);
  end if;
end $$;
