-- ============================================================================
-- SpecialCarer - lock server-managed columns on profiles
--
-- RLS lets a signed-in user update their own profiles row, and the database
-- grants cover every column. That meant a user could set, from the browser:
--   * organization_id (policies on service_users and organisation documents
--     read it, so this could join another organisation's data),
--   * works_with_children_admin_approved_at and the agency_opt_in_* approval
--     fields (safeguarding and compliance approvals that only admins grant),
--   * mfa_required / mfa_grace_period_ends_at (their own MFA enforcement),
--   * email, tax_code, ni_number (payroll and notification identity),
--   * compliance_blast_sent_at, created_at.
--
-- profiles_role_guard() already constrains direct API sessions (current_user
-- authenticated or anon). This replaces it so that, from those sessions, the
-- server-managed columns cannot be changed on UPDATE and must be at their
-- defaults on INSERT. Columns users legitimately edit stay writable:
-- full_name, phone, locale, country, avatar_url, updated_at, chat_translate_to,
-- calendar_token and role (role keeps the rules from the earlier migrations).
-- Server code uses the service role and SQL-editor/definer functions are not
-- the authenticated or anon database roles, so they are unaffected.
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
    -- Server-managed columns must be left at their defaults on a new row.
    if new.organization_id is not null
       or new.email is not null
       or new.tax_code is not null
       or new.ni_number is not null
       or new.agency_opt_in_status::text <> 'not_started'
       or new.agency_opt_in_started_at is not null
       or new.agency_opt_in_submitted_at is not null
       or new.agency_opt_in_approved_at is not null
       or new.agency_opt_in_approved_by is not null
       or new.agency_opt_in_rejected_reason is not null
       or new.agency_opt_in_paused_reason is not null
       or new.works_with_children_admin_approved_at is not null
       or new.agency_optin_grace_period_until is not null
       or new.compliance_blast_sent_at is not null
       or new.mfa_required is distinct from false
       or new.mfa_grace_period_ends_at is not null then
      raise exception 'profiles server-managed columns cannot be set from a client session'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: server-managed columns are read-only from a client session.
  if new.organization_id is distinct from old.organization_id
     or new.email is distinct from old.email
     or new.tax_code is distinct from old.tax_code
     or new.ni_number is distinct from old.ni_number
     or new.agency_opt_in_status is distinct from old.agency_opt_in_status
     or new.agency_opt_in_started_at is distinct from old.agency_opt_in_started_at
     or new.agency_opt_in_submitted_at is distinct from old.agency_opt_in_submitted_at
     or new.agency_opt_in_approved_at is distinct from old.agency_opt_in_approved_at
     or new.agency_opt_in_approved_by is distinct from old.agency_opt_in_approved_by
     or new.agency_opt_in_rejected_reason is distinct from old.agency_opt_in_rejected_reason
     or new.agency_opt_in_paused_reason is distinct from old.agency_opt_in_paused_reason
     or new.works_with_adults is distinct from old.works_with_adults
     or new.works_with_children is distinct from old.works_with_children
     or new.works_with_children_admin_approved_at is distinct from old.works_with_children_admin_approved_at
     or new.agency_optin_grace_period_until is distinct from old.agency_optin_grace_period_until
     or new.compliance_blast_sent_at is distinct from old.compliance_blast_sent_at
     or new.mfa_required is distinct from old.mfa_required
     or new.mfa_grace_period_ends_at is distinct from old.mfa_grace_period_ends_at
     or new.created_at is distinct from old.created_at then
    raise exception 'profiles server-managed columns cannot be changed from a client session'
      using errcode = '42501';
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
