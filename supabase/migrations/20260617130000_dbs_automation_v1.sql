-- ============================================================================
-- SpecialCarers — DBS Automation v1 (PR-DBS-2)
--
-- Additive columns on dbs_applications for the automation layer built on top
-- of PR-DBS-1's manual model:
--   - Veriff cross-check result (surname + DOB match against the carer's
--     gov-ID-confirmed identity from identity_verifications),
--   - admin surname-mismatch override (hyphenation / maiden-name cases).
--
-- Gated by NEXT_PUBLIC_DBS_ENABLED at the application layer; with the flag off
-- these columns are simply never written. Additive + idempotent throughout
-- (ADD COLUMN IF NOT EXISTS), so it is safe to re-run and stacks cleanly on
-- 20260617120000_dbs_applications_v1.sql.
-- ============================================================================

alter table public.dbs_applications
  add column if not exists cross_check_passed boolean,
  add column if not exists cross_check_run_at timestamptz,
  add column if not exists cross_check_mismatches jsonb,
  add column if not exists surname_override_by uuid references auth.users(id),
  add column if not exists surname_override_at timestamptz,
  add column if not exists surname_override_reason text;

comment on column public.dbs_applications.cross_check_passed is
  'Result of crossCheckDbsAgainstVeriff(): true when surname + DOB match the carer''s Veriff-confirmed identity. NULL until the cross-check has run.';
comment on column public.dbs_applications.cross_check_mismatches is
  'JSON array of mismatched field names (e.g. ["surname"]) from the last cross-check run. Empty array when the check passed.';
comment on column public.dbs_applications.surname_override_by is
  'Admin user who overrode a surname mismatch (hyphenation / maiden name). NULL when no override applied.';
