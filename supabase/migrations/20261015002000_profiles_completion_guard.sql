-- ============================================================================
-- SpecialCarer - stop finished profiles being "un-finished" from the client
--
-- profiles_role_guard() lets a seeker <-> caregiver switch happen while a
-- profile is still incomplete (no name or no country), which is the onboarding
-- step where people pick their side. A finished account could therefore blank
-- its name or country through the API and then switch side, bypassing the
-- carer/family separation.
--
-- This replaces the guard function so a direct API session cannot clear the
-- name or country of a profile that is already complete. Everything else in
-- the guard is unchanged. Server code, the service role and the SQL editor are
-- unaffected (they are not the authenticated or anon database roles).
--
-- Additive and idempotent. Existing rows are not modified.
-- ============================================================================

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

  -- A finished carer or family profile may not have its name or country
  -- cleared, otherwise it would look unfinished and could switch side.
  if old.role::text in ('seeker', 'caregiver')
     and coalesce(nullif(trim(old.full_name), ''), '') <> ''
     and coalesce(nullif(trim(old.country), ''), '') <> ''
     and (
       coalesce(nullif(trim(new.full_name), ''), '') = ''
       or coalesce(nullif(trim(new.country), ''), '') = ''
     ) then
    raise exception 'profiles name and country cannot be cleared from a client session'
      using errcode = '42501';
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
