-- ============================================================================
-- SpecialCarer - harden how profiles.role is assigned
--
-- Role assignment from client sessions is tightened so that privileged roles
-- can only be granted by server-side code or SQL, and so that an account keeps
-- the side (carer or family) it chose at onboarding.
--
--  * handle_new_user() no longer accepts 'admin' from sign-up metadata.
--  * A guard trigger on profiles constrains direct API sessions only
--    (current_user authenticated or anon). SECURITY DEFINER code such as the
--    sign-up trigger, the service role and the SQL editor are unaffected.
--      - INSERT: role must be seeker, caregiver or organization.
--      - UPDATE: role may not change, except seeker <-> caregiver while the
--        profile is still incomplete (no name or no country yet), which is
--        the onboarding step where people pick their side.
--
-- Additive and idempotent. Existing rows are not modified.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  meta_role text := nullif(trim(new.raw_user_meta_data->>'role'), '');
  org_name  text := nullif(trim(new.raw_user_meta_data->>'organisation_name'), '');
  -- 'admin' is deliberately NOT accepted from client-supplied metadata.
  resolved_role public.user_role := case
    when meta_role in ('seeker', 'caregiver', 'organization')
      then meta_role::public.user_role
    else 'seeker'::public.user_role
  end;
  new_org_id uuid;
begin
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

create or replace function public.profiles_role_guard()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  -- Only constrain direct API sessions. Definer functions run as their owner,
  -- and the service role / SQL editor use other database roles.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role is not null
       and new.role::text not in ('seeker', 'caregiver', 'organization') then
      raise exception 'profiles.role cannot be set to % from a client session', new.role
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role then
    if old.role::text in ('seeker', 'caregiver')
       and new.role::text in ('seeker', 'caregiver')
       and (
         coalesce(nullif(trim(old.full_name), ''), '') = ''
         or coalesce(nullif(trim(old.country), ''), '') = ''
       ) then
      return new;
    end if;
    raise exception 'profiles.role cannot be changed from a client session'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

do $guard$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'profiles_role_guard_trg'
       and tgrelid = 'public.profiles'::regclass
  ) then
    create trigger profiles_role_guard_trg
      before insert or update on public.profiles
      for each row execute function public.profiles_role_guard();
  end if;
end
$guard$;
