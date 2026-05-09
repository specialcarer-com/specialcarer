-- Profile v3.8 — structured certifications + photo gallery + computed
-- achievements view. Idempotent. RLS guards use pg_policies.policyname
-- (not the deprecated polname).
--
-- The legacy text[] caregiver_profiles.certifications column is left
-- in place for read compatibility; new writes go to the structured
-- caregiver_certifications table.

-- ── caregiver_certifications ─────────────────────────────────────
create table if not exists public.caregiver_certifications (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  issuer text,
  issued_at date,
  expires_at date,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  document_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists caregiver_certifications_carer_idx
  on public.caregiver_certifications (caregiver_id);

alter table public.caregiver_certifications enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'caregiver_certifications_owner_rw'
      and tablename = 'caregiver_certifications'
  ) then
    create policy caregiver_certifications_owner_rw on public.caregiver_certifications
      for all to authenticated
      using (caregiver_id = (select auth.uid()))
      with check (caregiver_id = (select auth.uid()));
  end if;
end $$;

-- Public-facing view: only verified certifications, only the columns
-- safe to surface on a carer profile page. Anonymous-readable.
create or replace view public.public_caregiver_certifications_v as
  select
    caregiver_id,
    id,
    title,
    issuer,
    issued_at,
    expires_at,
    verified_at
  from public.caregiver_certifications
  where verified_at is not null;

grant select on public.public_caregiver_certifications_v to authenticated, anon;

-- ── caregiver_photos (gallery, max 6) ────────────────────────────
create table if not exists public.caregiver_photos (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  caption text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists caregiver_photos_caregiver_sort_idx
  on public.caregiver_photos (caregiver_id, sort_order);

alter table public.caregiver_photos enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'caregiver_photos_owner_rw'
      and tablename = 'caregiver_photos'
  ) then
    create policy caregiver_photos_owner_rw on public.caregiver_photos
      for all to authenticated
      using (caregiver_id = (select auth.uid()))
      with check (caregiver_id = (select auth.uid()));
  end if;
end $$;

-- Public read once the carer's profile is published.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'caregiver_photos_public_read_when_published'
      and tablename = 'caregiver_photos'
  ) then
    create policy caregiver_photos_public_read_when_published on public.caregiver_photos
      for select to anon, authenticated
      using (
        exists (
          select 1 from public.caregiver_profiles cp
          where cp.user_id = caregiver_photos.caregiver_id
            and cp.is_published = true
        )
      );
  end if;
end $$;

-- Trigger: cap at 6 photos per caregiver.
create or replace function public.caregiver_photos_cap_6()
returns trigger
language plpgsql
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.caregiver_photos
  where caregiver_id = new.caregiver_id;
  if v_count >= 6 then
    raise exception 'caregiver_photos_max_6: a carer can have at most 6 gallery photos'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists caregiver_photos_max_6_trg on public.caregiver_photos;
create trigger caregiver_photos_max_6_trg
  before insert on public.caregiver_photos
  for each row execute function public.caregiver_photos_cap_6();

-- ── caregiver_achievements_v (computed view) ─────────────────────
-- One row per (caregiver_id, achievement_key). Carers with no
-- caregiver_stats entry still appear with progress_current=0.
-- The "verified_carer" achievement reads from caregiver_certifications.
create or replace view public.caregiver_achievements_v as
with base as (
  select
    cp.user_id as caregiver_id,
    coalesce(cs.completed_bookings, 0)::numeric as completed_bookings,
    cp.rating_avg,
    cp.rating_count,
    coalesce(cs.repeat_client_rate, 0)::numeric as repeat_client_rate,
    coalesce(cs.total_clients, 0)::numeric as total_clients,
    coalesce(cs.response_time_minutes, 9999)::numeric as response_time_minutes,
    coalesce(cs.on_time_rate, 0)::numeric as on_time_rate,
    coalesce(cs.on_time_tracked, 0)::numeric as on_time_tracked,
    coalesce(cp.tags, '{}'::text[]) as tags,
    exists (
      select 1
      from public.caregiver_certifications cc
      where cc.caregiver_id = cp.user_id
        and cc.verified_at is not null
        and (
          cc.title ilike '%dbs%'
          or cc.title ilike '%enhanced%'
        )
    ) as has_verified_dbs
  from public.caregiver_profiles cp
  left join public.caregiver_stats cs on cs.caregiver_id = cp.user_id
)
select
  caregiver_id,
  ach.achievement_key,
  ach.earned,
  ach.progress_current,
  ach.progress_target,
  ach.label,
  ach.description
from base b
cross join lateral (
  values
    (
      'hundred_jobs',
      b.completed_bookings >= 100,
      b.completed_bookings,
      100::numeric,
      '100 jobs',
      'Completed 100+ bookings on SpecialCarer.'
    ),
    (
      'top_rated',
      b.rating_count >= 10 and b.rating_avg is not null and b.rating_avg >= 4.8,
      coalesce(b.rating_avg, 0)::numeric,
      4.8::numeric,
      'Top-rated',
      'Average rating ≥ 4.8 over 10+ reviews.'
    ),
    (
      'dementia_specialist',
      'dementia' = any(b.tags),
      case when 'dementia' = any(b.tags) then 1 else 0 end::numeric,
      0::numeric,
      'Dementia specialist',
      'Self-declared specialism in dementia care.'
    ),
    (
      'quick_responder',
      b.response_time_minutes <= 60 and b.completed_bookings >= 5,
      b.response_time_minutes,
      60::numeric,
      'Quick responder',
      'Replies to booking requests within an hour.'
    ),
    (
      'reliable',
      b.on_time_rate >= 0.95 and b.on_time_tracked >= 10,
      (b.on_time_rate * 100)::numeric,
      95::numeric,
      'Reliable',
      'On time for 95%+ of tracked shifts.'
    ),
    (
      'repeat_favourite',
      b.repeat_client_rate >= 0.30 and b.total_clients >= 10,
      (b.repeat_client_rate * 100)::numeric,
      30::numeric,
      'Repeat favourite',
      'Clients keep coming back — 30%+ rebook rate.'
    ),
    (
      'verified_carer',
      b.has_verified_dbs,
      case when b.has_verified_dbs then 1 else 0 end::numeric,
      0::numeric,
      'Background-checked',
      'DBS / Enhanced check verified by SpecialCarer.'
    ),
    (
      'rookie_pro',
      b.completed_bookings >= 10 and b.completed_bookings < 100,
      b.completed_bookings,
      10::numeric,
      'Rookie pro',
      'First 10 bookings under their belt.'
    )
) as ach(
  achievement_key,
  earned,
  progress_current,
  progress_target,
  label,
  description
);

grant select on public.caregiver_achievements_v to authenticated, anon;

-- ── Storage policy note ──────────────────────────────────────────
-- The `caregiver-photos` bucket already exists with the
-- `{auth.uid()}/...` first-folder write policy from the
-- 20260507_avatar_url migration. Both `{uid}/gallery/...` and
-- `{uid}/cert-...` paths satisfy that scheme — no new storage
-- policies are required.
