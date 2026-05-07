-- Universal avatar_url for every user (seekers, carers, admins).
--
-- Why this lives on `profiles` and not just `caregiver_profiles`:
--   - `caregiver_profiles` only exists for carers, so seekers had no
--     home for an avatar URL.
--   - Storing it in `auth.users.user_metadata` works but isn't queryable
--     by other users — so search cards / chat thread heads / family
--     sharing UI couldn't show photos for seekers.
--   - `profiles` is queryable, has RLS, and is already loaded on every
--     screen that needs the avatar.
--
-- For carers we keep `caregiver_profiles.photo_url` as the public-facing
-- column on the carer card / search results, and mirror this on save.
alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Public URL to the profile photo in the caregiver-photos storage bucket. '
  'Updated by /m/profile/edit. For carers, also mirrored into '
  'caregiver_profiles.photo_url.';
