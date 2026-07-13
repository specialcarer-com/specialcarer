-- Ops-review note for visit clock-in verification (Sprint 4.5 v2 follow-up).
--
-- When the carer's device downgrades the photo status (e.g. camera hardware
-- unavailable → `skipped`, upload failed after retry → `error`) it now attaches
-- a short human-readable reason so ops has context during manual review. Stored
-- alongside the existing verification columns added in
-- 20260712140000_visit_events_verification.
--
-- Additive + idempotent (mirrors the repo migration conventions).

alter table public.visit_events
  add column if not exists verification_note text;

comment on column public.visit_events.verification_note is
  'Short ops-facing reason the capturing device attached when downgrading the '
  'photo verification status (e.g. "camera unavailable", "upload failed"). Null '
  'on the normal pending/passed path.';
