-- Make /signup/organisation create a first-class organisation at sign-up.
--
-- Context / reconciliation note:
--   A full organisation schema already exists from 20260509_organizations_v1
--   (American spelling): public.organizations + organization_members +
--   organization_documents + organization_billing, plus the 'organization'
--   value on public.user_role and the multi-step /m/org/register flow that
--   populates it. We deliberately REUSE that schema rather than introduce a
--   parallel British-spelled `organisations` table or a duplicate
--   'organisation' enum value — a second near-identical role/table would
--   fragment org data and break every surface that keys off 'organization'
--   (the org dashboard, admin verification queue, and the register save
--   route which sets profiles.role = 'organization').
--
-- This migration adds the two things the lightweight /signup/organisation
-- flow needs that the existing schema lacked:
--   1. organizations.created_by — who opened the account at sign-up.
--   2. profiles.organization_id — a direct, indexed pointer from a user's
--      profile to their org (the membership join table still exists and
--      remains the source of truth for multi-seat access; this column is a
--      convenience link stamped at sign-up for the single-owner case).
-- and rewires handle_new_user() to create the org + owner membership when a
-- user signs up via the organisation audience.

-- ── organizations.created_by ─────────────────────────────────────
alter table public.organizations
  add column if not exists created_by uuid references auth.users(id);

comment on column public.organizations.created_by is
  'The auth user who created this organisation at sign-up via '
  '/signup/organisation. Null for orgs created through the older '
  '/m/org/register flow (ownership tracked via organization_members).';

-- ── profiles.organization_id ─────────────────────────────────────
alter table public.profiles
  add column if not exists organization_id uuid references public.organizations(id);

create index if not exists profiles_organization_id_idx
  on public.profiles (organization_id)
  where organization_id is not null;

comment on column public.profiles.organization_id is
  'Convenience pointer to the user''s organisation, stamped at sign-up for '
  'organisation owners. organization_members remains the source of truth '
  'for multi-seat membership and roles.';

-- ── Allow the creator to update their own org row ────────────────
-- The existing organizations_members_update policy already covers members
-- via organization_members. Add a creator-side path so the owner can update
-- the org row even before / independently of a membership row.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'organizations_creator_update'
      and tablename = 'organizations'
  ) then
    create policy organizations_creator_update on public.organizations
      for update to authenticated
      using (created_by = (select auth.uid()))
      with check (created_by = (select auth.uid()));
  end if;
end $$;

-- ── handle_new_user(): handle the organisation sign-up case ──────
-- Runs security definer so it bypasses RLS while stamping rows. The
-- non-organisation path is byte-for-byte the prior behaviour (honour the
-- chosen role from metadata, default to 'seeker').
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  meta_role text := nullif(trim(new.raw_user_meta_data->>'role'), '');
  org_name  text := nullif(trim(new.raw_user_meta_data->>'organisation_name'), '');
  resolved_role public.user_role := case
    when meta_role in ('seeker', 'caregiver', 'admin', 'organization')
      then meta_role::public.user_role
    else 'seeker'::public.user_role
  end;
  new_org_id uuid;
begin
  -- Organisation sign-up: create the org + owner membership, then link the
  -- profile. Requires both role = 'organization' and an organisation name;
  -- if either is missing we fall through to the normal profile insert.
  if resolved_role = 'organization' and org_name is not null then
    insert into public.organizations (legal_name, created_by, verification_status)
    values (org_name, new.id, 'draft')
    returning id into new_org_id;

    insert into public.organization_members (organization_id, user_id, role, full_name)
    values (
      new_org_id,
      new.id,
      'owner',
      nullif(trim(new.raw_user_meta_data->>'full_name'), '')
    )
    on conflict (organization_id, user_id) do nothing;

    insert into public.profiles (id, full_name, role, organization_id)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', ''),
      'organization'::public.user_role,
      new_org_id
    )
    on conflict (id) do update
      set role = excluded.role,
          organization_id = excluded.organization_id;

    return new;
  end if;

  -- Default path (seeker / caregiver / admin): unchanged from
  -- 20260506_handle_new_user_honors_role.
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    resolved_role
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
