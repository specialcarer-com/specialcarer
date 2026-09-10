-- Honor the role chosen at sign-up.
-- Previously the trigger only copied full_name and let the role column
-- default to 'seeker', so users who chose 'caregiver' on /m/sign-up still
-- landed on a seeker profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  meta_role text := nullif(trim(new.raw_user_meta_data->>'role'), '');
  resolved_role public.user_role := case
    when meta_role in ('seeker', 'caregiver', 'admin') then meta_role::public.user_role
    else 'seeker'::public.user_role
  end;
begin
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
