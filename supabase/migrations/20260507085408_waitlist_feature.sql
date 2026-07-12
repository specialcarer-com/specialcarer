-- Adds a `feature` column to the waitlist so we can capture interest
-- in upcoming features (e.g. recurring bookings) without polluting the
-- main "homepage" signup list.

alter table public.waitlist
  add column if not exists feature text;

-- The original table had a UNIQUE(email) constraint. With multiple
-- features we now want UNIQUE(email, feature) instead so the same
-- person can join the homepage list AND the recurring waitlist.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.waitlist'::regclass
      and conname = 'waitlist_email_key'
  ) then
    alter table public.waitlist drop constraint waitlist_email_key;
  end if;
end $$;

create unique index if not exists waitlist_email_feature_unique
  on public.waitlist (email, coalesce(feature, ''));
