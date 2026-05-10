-- Per-page hero banner media managed by admins.
-- One row per marketing page. page_key is the stable slug used by the
-- marketing pages and the admin UI to look up media.
create table if not exists public.page_hero_banners (
  page_key      text primary key,
  media_url     text not null,
  media_kind    text not null check (media_kind in ('image','video')),
  alt           text,
  focal_x       smallint not null default 50 check (focal_x between 0 and 100),
  focal_y       smallint not null default 50 check (focal_y between 0 and 100),
  storage_path  text,
  poster_url    text,                       -- optional video poster image
  active        boolean not null default true,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id)
);

comment on table public.page_hero_banners is
  'Admin-managed hero banner media for marketing pages. One row per page slot.';

alter table public.page_hero_banners enable row level security;

drop policy if exists "page_hero_banners_public_read" on public.page_hero_banners;
create policy "page_hero_banners_public_read"
  on public.page_hero_banners for select
  using (active);

drop policy if exists "page_hero_banners_admin_read_all" on public.page_hero_banners;
create policy "page_hero_banners_admin_read_all"
  on public.page_hero_banners for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "page_hero_banners_admin_write" on public.page_hero_banners;
create policy "page_hero_banners_admin_write"
  on public.page_hero_banners for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'page-banners',
  'page-banners',
  true,
  104857600,
  array[
    'image/jpeg','image/png','image/webp','image/avif','image/gif',
    'video/mp4','video/webm','video/quicktime'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "page_banners_public_read" on storage.objects;
create policy "page_banners_public_read"
  on storage.objects for select
  using (bucket_id = 'page-banners');

drop policy if exists "page_banners_admin_write" on storage.objects;
create policy "page_banners_admin_write"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'page-banners' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    bucket_id = 'page-banners' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create index if not exists page_hero_banners_active_idx
  on public.page_hero_banners (active);
