-- ============================================================================
-- SpecialCarer — Family Sharing v1 (read-only members, magic-link invites)
--
-- A "family" is owned by ONE primary user (the booker / payer). They invite
-- up to N family members (siblings, partners, adult children) who get
-- READ-ONLY access to the primary's bookings, chats, and care journal
-- entries about them.
--
-- v1 design:
-- - One family per primary user (1:1). Future v2 can extend to multi-family.
-- - family_members.user_id is nullable until the invite is accepted; once
--   accepted, user_id is filled and status flips to 'active'.
-- - family_invites holds the magic-link token + expiry. Tokens are
--   single-use; accepting them creates the active family_members row.
-- - All write paths go through service role (server actions / API routes).
-- - SELECT RLS lets each user see their own family + memberships they
--   participate in.
--
-- Invariant: the primary user is automatically a member of their own
-- family (role='primary'). This row is created by the trigger below.
-- ============================================================================

-- 1. Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'family_member_role') then
    create type family_member_role as enum ('primary','member');
  end if;
  if not exists (select 1 from pg_type where typname = 'family_member_status') then
    create type family_member_status as enum ('active','invited','removed');
  end if;
  if not exists (select 1 from pg_type where typname = 'family_invite_status') then
    create type family_invite_status as enum ('pending','accepted','revoked','expired');
  end if;
end$$;

-- 2. families — one row per primary user (the seeker who books / pays)
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  primary_user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,                           -- e.g. "The Smith family"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists families_primary_user_idx
  on public.families(primary_user_id);

-- 3. family_members — who has access to a family
-- user_id is null while invite is pending; filled on accept.
create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,    -- null until accepted
  invited_email text,                          -- snapshot of the email invited
  display_name text,                           -- snapshot of nickname for UI
  role family_member_role not null default 'member',
  status family_member_status not null default 'invited',
  joined_at timestamptz,                       -- set on accept
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists family_members_family_user_uidx
  on public.family_members(family_id, user_id)
  where user_id is not null;

create index if not exists family_members_user_idx
  on public.family_members(user_id)
  where user_id is not null and status = 'active';

create index if not exists family_members_family_idx
  on public.family_members(family_id);

-- 4. family_invites — magic-link tokens
create table if not exists public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  invited_email text not null,
  display_name text,
  -- token is the URL-safe random string we email; stored hashed for safety
  token_hash text not null unique,
  status family_invite_status not null default 'pending',
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  -- Once accepted, link to the resulting family_members row
  family_member_id uuid references public.family_members(id) on delete set null
);

create index if not exists family_invites_family_idx
  on public.family_invites(family_id);

create index if not exists family_invites_status_idx
  on public.family_invites(status, expires_at);

create index if not exists family_invites_email_idx
  on public.family_invites(invited_email)
  where status = 'pending';

-- 5. updated_at triggers
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists families_set_updated_at on public.families;
create trigger families_set_updated_at
  before update on public.families
  for each row execute function public.tg_set_updated_at();

drop trigger if exists family_members_set_updated_at on public.family_members;
create trigger family_members_set_updated_at
  before update on public.family_members
  for each row execute function public.tg_set_updated_at();

-- 6. Auto-create primary member row when family is created
create or replace function public.tg_families_create_primary_member()
returns trigger language plpgsql as $$
begin
  insert into public.family_members (family_id, user_id, role, status, joined_at)
  values (new.id, new.primary_user_id, 'primary', 'active', now())
  on conflict (family_id, user_id) where user_id is not null do nothing;
  return new;
end$$;

drop trigger if exists families_create_primary_member on public.families;
create trigger families_create_primary_member
  after insert on public.families
  for each row execute function public.tg_families_create_primary_member();

-- 7. RLS
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invites enable row level security;

-- families: readable by primary user OR by any active member
drop policy if exists "members can read own family" on public.families;
create policy "members can read own family"
  on public.families for select
  to authenticated
  using (
    primary_user_id = auth.uid()
    or exists (
      select 1 from public.family_members fm
      where fm.family_id = families.id
        and fm.user_id = auth.uid()
        and fm.status = 'active'
    )
  );

-- family_members: readable by primary user OR by any active member of that family
drop policy if exists "members can read family memberships" on public.family_members;
create policy "members can read family memberships"
  on public.family_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.families f
      where f.id = family_members.family_id
        and f.primary_user_id = auth.uid()
    )
    or exists (
      select 1 from public.family_members fm2
      where fm2.family_id = family_members.family_id
        and fm2.user_id = auth.uid()
        and fm2.status = 'active'
    )
  );

-- family_invites: readable by primary user only (don't expose tokens to members)
drop policy if exists "primary can read family invites" on public.family_invites;
create policy "primary can read family invites"
  on public.family_invites for select
  to authenticated
  using (
    exists (
      select 1 from public.families f
      where f.id = family_invites.family_id
        and f.primary_user_id = auth.uid()
    )
  );

-- All writes go through service role (server-side only)

-- ============================================================================
-- 8. Extend care_journal_entries SELECT policy: family members of the
-- about_user_id can read entries about that user.
-- ============================================================================
drop policy if exists "parties can read journal entry" on public.care_journal_entries;
create policy "parties can read journal entry"
  on public.care_journal_entries for select
  to authenticated
  using (
    auth.uid() = author_id
    or auth.uid() = about_user_id
    or (
      booking_id is not null and exists (
        select 1 from public.bookings b
        where b.id = booking_id
          and (b.seeker_id = auth.uid() or b.caregiver_id = auth.uid())
      )
    )
    -- NEW: any active family member of about_user_id can read
    or (
      about_user_id is not null and exists (
        select 1
        from public.family_members fm
        join public.families f on f.id = fm.family_id
        where f.primary_user_id = care_journal_entries.about_user_id
          and fm.user_id = auth.uid()
          and fm.status = 'active'
      )
    )
    -- NEW: family members of the booking's seeker can read entries about that booking
    or (
      booking_id is not null and exists (
        select 1
        from public.bookings b
        join public.families f on f.primary_user_id = b.seeker_id
        join public.family_members fm on fm.family_id = f.id
        where b.id = care_journal_entries.booking_id
          and fm.user_id = auth.uid()
          and fm.status = 'active'
      )
    )
  );

comment on table public.families is 'Family Sharing v1. One family per primary (booker/payer) user. Trigger auto-creates a primary family_members row.';
comment on table public.family_members is 'Members of a family. user_id null while invite pending; filled on accept (status flips to active).';
comment on table public.family_invites is 'Magic-link invites. token_hash is sha256 of the URL token; never store plaintext.';
