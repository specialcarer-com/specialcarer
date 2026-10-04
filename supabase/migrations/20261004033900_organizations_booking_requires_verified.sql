-- ============================================================================
-- SpecialCarer — organizations.booking_enabled requires verification_status='verified'
--
-- organizations.verification_status and organizations.booking_enabled were
-- two independent columns with nothing tying them together — no trigger,
-- no constraint. An org could be moved to 'rejected' (e.g. its CQC number
-- turned out to be a placeholder / failed verification) while its
-- booking_enabled flag stayed true from whenever it was originally set,
-- leaving a rejected, unregistered care provider still bookable.
--
-- Found 2026-10-04: Riverside Care Agency Ltd (93780260-a087-4b7e-acef-
-- 26ce9005919c) was corrected to verification_status='rejected' (null
-- placeholder cqc_number cleared) but booking_enabled was left true, by
-- design of the request that made the change — nothing in the schema
-- required the two to move together.
--
-- This migration:
--   1. Backfills any existing row where booking_enabled=true but
--      verification_status != 'verified' (currently just Riverside).
--   2. Adds a trigger that auto-clears booking_enabled whenever
--      verification_status is set to anything other than 'verified',
--      so application code doesn't need to remember to do both.
--   3. Adds a CHECK constraint as a hard backstop: booking_enabled=true
--      is only representable when verification_status='verified', even
--      for writes that bypass the trigger (e.g. a bulk load run with
--      session_replication_role=replica).
--
-- Deploy-safe: the backfill only touches rows already in the inconsistent
-- state this migration exists to prevent; it does not change any row that
-- is already correct.
-- ============================================================================

-- 1. Backfill: no org should currently have booking_enabled=true unless
--    it's verified. (At time of writing this is just Riverside Care.)
update public.organizations
set booking_enabled = false
where booking_enabled = true
  and verification_status is distinct from 'verified';

-- 2. Trigger: keep booking_enabled in sync going forward without relying
--    on every caller to remember to touch both columns.
create or replace function public.organizations_sync_booking_enabled()
returns trigger
language plpgsql
as $$
begin
  if new.verification_status is distinct from 'verified' then
    new.booking_enabled := false;
  end if;
  return new;
end;
$$;

comment on function public.organizations_sync_booking_enabled() is
  'Forces organizations.booking_enabled to false whenever verification_status is not ''verified''. Prevents a rejected/suspended/pending/draft org from silently staying bookable after a status change. See migration 20261004033900.';

drop trigger if exists trg_organizations_sync_booking_enabled on public.organizations;

create trigger trg_organizations_sync_booking_enabled
  before insert or update of verification_status, booking_enabled
  on public.organizations
  for each row
  execute function public.organizations_sync_booking_enabled();

-- 3. Backstop: make the bad state unrepresentable even for writes that
--    skip the trigger (e.g. session_replication_role=replica during a
--    bulk load or migration).
alter table public.organizations
  add constraint organizations_booking_requires_verified
  check (not booking_enabled or verification_status = 'verified');
