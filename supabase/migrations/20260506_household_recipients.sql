-- Household recipients: who in the family needs care
-- Three kinds: child, senior, home (a household location/set of pets/etc.)
-- One owner; optionally tied to a family for shared visibility.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'recipient_type') then
    create type public.recipient_type as enum ('child','senior','home');
  end if;
end $$;

create table if not exists public.household_recipients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  kind public.recipient_type not null,

  -- common fields
  display_name text not null,
  notes text,
  photo_url text,

  -- child-specific
  date_of_birth date,
  allergies text[],
  school text,
  special_needs text[],

  -- senior-specific
  mobility_level text check (mobility_level in ('independent','assisted','wheelchair','bedbound')),
  medical_conditions text[],
  medications jsonb,

  -- home-specific
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postcode text,
  country text check (country in ('GB','US')),
  property_size text check (property_size in ('studio','1bed','2bed','3bed','4bed_plus','house_small','house_med','house_large')),
  has_pets boolean,
  pets_notes text,
  access_instructions text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists household_recipients_owner_idx on public.household_recipients(owner_id);
create index if not exists household_recipients_family_idx on public.household_recipients(family_id);
create index if not exists household_recipients_kind_idx on public.household_recipients(kind);

create or replace function public.set_household_recipients_updated_at()
returns trigger language plpgsql as $func$
begin
  new.updated_at = now();
  return new;
end
$func$;

drop trigger if exists trg_household_recipients_updated_at on public.household_recipients;
create trigger trg_household_recipients_updated_at
  before update on public.household_recipients
  for each row execute function public.set_household_recipients_updated_at();

alter table public.household_recipients enable row level security;

drop policy if exists hr_owner_all on public.household_recipients;
create policy hr_owner_all on public.household_recipients
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists hr_family_read on public.household_recipients;
create policy hr_family_read on public.household_recipients
  for select to authenticated
  using (
    family_id is not null
    and exists (
      select 1 from public.family_members fm
      where fm.family_id = household_recipients.family_id
        and fm.user_id = auth.uid()
        and fm.status = 'active'
    )
  );

comment on table public.household_recipients is 'Who needs care: children, seniors, or households. Owner-managed; shareable to a family.';
