-- ============================================================================
-- SpecialCarer — F1d / DSAR "awaiting_manual_fulfilment" state
--
-- Emergency soft-pause of the automated DSAR exporter. On 17 Sep 2026 a
-- schema-drift audit found that dsar-export/1.0.0 silently omits 8 of
-- 11 subject-data tables (bookings, references, DBS events, care-plan
-- involvement, reviews, saved caregivers, payments, and the compliance
-- documents table). Full finding:
--   /home/user/workspace/phase_f/dsar_exporter_schema_drift_17sep.md
--
-- Until the exporter fix ships (parallel PR), the /api/dsar/submit
-- endpoint will still write the row (so the one-calendar-month statutory
-- clock starts) but route the request to a new state
-- `awaiting_manual_fulfilment` so:
--
--   * the /api/cron/dsar-fulfil sweeper does NOT pick it up (which
--     would send a deficient export), and
--   * Ops can fulfil manually from the admin queue within the deadline.
--
-- Once the exporter fix lands this soft-pause PR is reverted and the
-- new state may become obsolete — but the value is left in the CHECK
-- constraint so any residual rows created during the pause window remain
-- valid.
--
-- Deploy-safe pattern (per B5, F1a): additive CHECK-constraint swap
-- inside a defensive DO block that discovers the constraint name via
-- pg_constraint. Existing rows are unaffected (their state values are
-- already in the allowed set). No data backfill.
-- ============================================================================

do $$
declare
  cname text;
begin
  select conname
    into cname
    from pg_constraint
    where conrelid = 'public.dsar_requests'::regclass
      and pg_get_constraintdef(oid) like '%state%in%';
  if cname is not null then
    execute format('alter table public.dsar_requests drop constraint %I', cname);
  end if;
end$$;

alter table public.dsar_requests
  add constraint dsar_requests_state_check
  check (state in (
    'submitted',
    'verifying',
    'in_progress',
    'delivered',
    'rejected',
    'cancelled',
    'failed',
    'awaiting_manual_fulfilment'
  ));

comment on constraint dsar_requests_state_check on public.dsar_requests is
  'Valid lifecycle states for a DSAR row. ''awaiting_manual_fulfilment'' was added in F1d as an emergency soft-pause: the automated exporter has schema drift and would deliver deficient exports, so /api/dsar/submit routes new requests to this state and Ops fulfil manually from the admin queue until the exporter fix ships.';
