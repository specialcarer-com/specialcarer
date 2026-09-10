-- Admin Ops v3.12 — split chunk for ledger alignment.
-- Original bundle: supabase/migrations/20260509_admin_ops_v3_12.sql
-- Split at logical Gap boundaries; all sub-files remain idempotent.
--
-- Contains Gap 5 (built-in CMS) schema and sample content seed.

-- ─── Gap 5: Built-in CMS ────────────────────────────────────────────
create table if not exists public.cms_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(slug) between 1 and 120),
  title text not null check (length(title) between 1 and 200),
  excerpt text,
  body_md text not null default '',
  hero_image_url text,
  author_id uuid references auth.users(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','published','archived')),
  published_at timestamptz,
  audience text[] not null default '{}',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cms_posts_status_idx on public.cms_posts(status);

create or replace function public.cms_posts_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'cms_posts_touch_trg'
  ) then
    create trigger cms_posts_touch_trg
      before update on public.cms_posts
      for each row execute function public.cms_posts_touch();
  end if;
end $$;

alter table public.cms_posts enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'cms_posts_public_select_published'
      and tablename = 'cms_posts'
  ) then
    create policy cms_posts_public_select_published on public.cms_posts
      for select to anon, authenticated
      using (
        status = 'published'
        or exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'cms_posts_admin_write'
      and tablename = 'cms_posts'
  ) then
    create policy cms_posts_admin_write on public.cms_posts
      for all to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      )
      with check (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;

create table if not exists public.cms_faqs (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  question text not null check (length(question) between 1 and 300),
  answer_md text not null default '',
  sort_order int not null default 0,
  audience text[] not null default '{}',
  status text not null default 'published'
    check (status in ('draft','published','archived')),
  updated_at timestamptz not null default now()
);
create index if not exists cms_faqs_category_idx
  on public.cms_faqs(category, sort_order);

create or replace function public.cms_faqs_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'cms_faqs_touch_trg'
  ) then
    create trigger cms_faqs_touch_trg
      before update on public.cms_faqs
      for each row execute function public.cms_faqs_touch();
  end if;
end $$;

alter table public.cms_faqs enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'cms_faqs_public_select'
      and tablename = 'cms_faqs'
  ) then
    create policy cms_faqs_public_select on public.cms_faqs
      for select to anon, authenticated
      using (
        status = 'published'
        or exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'cms_faqs_admin_write'
      and tablename = 'cms_faqs'
  ) then
    create policy cms_faqs_admin_write on public.cms_faqs
      for all to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      )
      with check (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;

create table if not exists public.cms_banners (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (length(key) between 1 and 80),
  title text not null,
  body text,
  cta_label text,
  cta_href text,
  audience text[] not null default '{}',
  placement text not null
    check (placement in
      ('home_top','dashboard_top','app_home','mobile_modal')),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  dismissible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cms_banners_placement_idx
  on public.cms_banners(placement, active);

create or replace function public.cms_banners_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'cms_banners_touch_trg'
  ) then
    create trigger cms_banners_touch_trg
      before update on public.cms_banners
      for each row execute function public.cms_banners_touch();
  end if;
end $$;

alter table public.cms_banners enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'cms_banners_public_select'
      and tablename = 'cms_banners'
  ) then
    create policy cms_banners_public_select on public.cms_banners
      for select to anon, authenticated
      using (true);
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'cms_banners_admin_write'
      and tablename = 'cms_banners'
  ) then
    create policy cms_banners_admin_write on public.cms_banners
      for all to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      )
      with check (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;


-- ─── Gap 5 sample CMS content ──────────────────────────────────────
insert into public.cms_posts
  (slug, title, excerpt, body_md, status, published_at, audience, tags)
values (
  'welcome-to-specialcarer-3-12',
  'Welcome to SpecialCarer 3.12',
  'A round-up of new ops tooling: re-verification, marketplace heatmap, native ticketing, CMS, compliance, finance and KPI rollups.',
  '# Welcome\n\nThis release ships eight admin-ops gaps as one feature pack. You can read the full notes in the build log.',
  'published', now(), array['UK','US','families','carers'],
  array['release','admin']
)
on conflict (slug) do nothing;

insert into public.cms_faqs
  (category, question, answer_md, sort_order, audience, status)
values
  ('Getting started',
    'How do I book a carer?',
    'Search by city or postcode, pick a verified carer, and book online. Payment is held in escrow until the shift is complete.',
    10, array['families','UK','US'], 'published'),
  ('Safety',
    'Are carers background checked?',
    'Yes — UK carers complete an Enhanced DBS check; US carers complete a Checkr-equivalent screening before any booking.',
    20, array['families','UK','US'], 'published'),
  ('Carers',
    'How does the application pipeline work?',
    'After you apply we screen your details, schedule an interview, run a background check, and onboard you through training before activation.',
    30, array['carers','UK','US'], 'published')
on conflict do nothing;

-- One sample home_top banner — disabled by default (active=false) so a
-- fresh seed doesn't change the production homepage.
insert into public.cms_banners
  (key, title, body, cta_label, cta_href, audience, placement,
   active, dismissible)
values (
  'home-top-3-12-launch',
  'New in SpecialCarer 3.12',
  'Marketplace ops dashboard, native ticketing, and built-in CMS are live.',
  'Read more', '/blog/welcome-to-specialcarer-3-12',
  array['UK','US','family','carer','org','all'], 'home_top',
  false, true
)
on conflict (key) do nothing;

