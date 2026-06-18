-- Public profile slug for carers — powers the friendly /c/<slug> share URL.
--
-- Additive and nullable: existing UUID-based /caregiver/<user_id> links keep
-- working. Slugs are backfilled for GB carers below and assigned on publish
-- going forward (see src/lib/care/slug.ts).

alter table public.caregiver_profiles
  add column if not exists public_slug text;

-- Unique only among non-null values so the nullable default doesn't collide.
create unique index if not exists caregiver_profiles_public_slug_key
  on public.caregiver_profiles (public_slug)
  where public_slug is not null;

-- Backfill slugs for existing GB carers (UK-only region policy). Slug shape
-- mirrors src/lib/care/slug.ts: <first>-<last-initial>-<4 hex from user_id>.
update public.caregiver_profiles c
set public_slug =
  nullif(
    regexp_replace(
      lower(coalesce(split_part(c.display_name, ' ', 1), '')),
      '[^a-z0-9]+', '', 'g'
    ),
    ''
  )
  || case
       when length(
         regexp_replace(
           lower(coalesce(nullif(split_part(c.display_name, ' ', 2), ''), '')),
           '[^a-z0-9]+', '', 'g'
         )
       ) > 0
       then '-' || substr(
         regexp_replace(
           lower(split_part(c.display_name, ' ', 2)),
           '[^a-z0-9]+', '', 'g'
         ), 1, 1
       )
       else ''
     end
  || '-' || substr(c.user_id::text, 1, 4)
where c.public_slug is null
  and c.country = 'GB'
  and coalesce(
        nullif(
          regexp_replace(lower(coalesce(c.display_name, '')), '[^a-z0-9]+', '', 'g'),
          ''
        ),
        ''
      ) <> '';

-- Carers with no usable display name still get a stable, unique slug.
update public.caregiver_profiles c
set public_slug = 'carer-' || substr(c.user_id::text, 1, 4)
where c.public_slug is null
  and c.country = 'GB';
