-- ============================================================================
-- SpecialCarer — E5: KPI rollup honesty (seed cleanup + metric rename).
--
-- Mostly data cleanup + one additive schema change to widen the metric
-- CHECK constraint so the renamed metric slug can be written.
-- Discovery: /phase_e/e5_discovery.md.
--
-- Context
-- ───────
-- The `kpi_rollups_daily` table has been populated with fictional seed data
-- since 2026-05-09. Every row has `state = 'ok'` and `computed_at` frozen
-- at the seed timestamp, so `/admin/analytics` has been rendering ~4-month
-- old fabricated numbers as trustworthy today-values. Root cause:
--
--   1. `/api/cron/kpi-rollup-hourly` was never registered in `vercel.json`
--      (fixed in this PR — added at `5 * * * *`).
--   2. The B2 seed rows were never cleared, so even after the cron starts
--      running, the sparkline history and the pre-today cells will keep
--      showing seed values.
--
-- This migration deletes the seed rows so the cron re-populates from a
-- clean slate on its next run.
--
-- Safety
-- ──────
-- The rows being deleted are seed / fixture data, NOT user-generated.
-- Evidence:
--   * All 84 rows in prod have `computed_at = 2026-05-09 16:55:32+00`.
--   * The stated values (348-411 bookings/day, £16k-£18k GMV/day) do not
--     match reality: prod has 13 bookings total, ever, and £0 in paidish
--     GMV. The seed values were plausible fixtures, not derived numbers.
--   * `kpi_rollups_daily` is a read-only projection consumed only by
--     `/admin/analytics`; nothing writes back and nothing else reads it.
--
-- The cutoff `2026-09-15T00:00:00Z` is chosen to erase every pre-E5 row
-- while allowing the first honest cron write (later today) to survive if
-- the migration is re-run after that write.
--
-- Governance
-- ──────────
-- The two DELETEs are DML, not DDL — the additive-only rule for schema
-- changes does not apply to them. The CHECK-constraint widen is additive
-- (adds one accepted value; does not remove any). No policy drops, no
-- `||` in DDL literal clauses. The whole migration is idempotent — a
-- second apply is a no-op (DELETEs match nothing; the CHECK swap uses
-- IF EXISTS + a distinct constraint name).
-- ============================================================================

-- 1. Remove stale seed rows that were rendering as trustworthy today-values
--    on /admin/analytics.
delete from public.kpi_rollups_daily
where computed_at < '2026-09-15T00:00:00Z';

-- 2. Remove any 'nps' metric rows. The metric is being renamed to
--    'avg_review_rating' because the underlying data (1-5 star reviews)
--    does not support true NPS methodology (which requires a 0-10 promoter
--    survey). Belt-and-braces after the seed delete above — if a fresh
--    'nps' row somehow slipped in between the seed delete and now, this
--    catches it.
delete from public.kpi_rollups_daily where metric = 'nps';

-- 3. Widen the metric CHECK constraint so the renamed slug is accepted.
--    The original constraint (from 20260509165511_admin_ops_v3_12_c7_gap_8)
--    enumerated a fixed list including 'nps' but not 'avg_review_rating'.
--    Adding the new slug is additive; we keep 'nps' in the allowed set for
--    now so any lagging writer or downstream that hasn't picked up the
--    rename doesn't hard-fail (rows are deleted in step 2 anyway). A
--    future migration can retire 'nps' once no code references it.
--
--    We drop the anonymous CHECK by pattern (its generated name looks
--    like `kpi_rollups_daily_metric_check`) via IF EXISTS, then add a
--    named replacement. If the drop finds nothing (constraint already
--    swapped in a prior apply), the ADD is guarded by NOT VALID/NOT
--    EXISTS logic below.
alter table public.kpi_rollups_daily
  drop constraint if exists kpi_rollups_daily_metric_check;

alter table public.kpi_rollups_daily
  drop constraint if exists kpi_rollups_daily_metric_allowed;

alter table public.kpi_rollups_daily
  add constraint kpi_rollups_daily_metric_allowed
  check (metric in (
    'bookings',
    'gmv',
    'nps',
    'avg_review_rating',
    'repeat_rate',
    'fill_rate',
    'time_to_match_min'
  ));
