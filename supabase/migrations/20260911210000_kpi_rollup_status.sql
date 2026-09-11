-- Phase B / B2 — Data-quality status on KPI rollups.
--
-- Removes the last hiding-place for the synthetic KPI fallback in
-- /api/cron/kpi-rollup-hourly. The cron now writes NULL + state='error'
-- (or state='stale') on rows it can't derive, and the admin dashboard
-- renders that honestly instead of a plausible-looking fabricated number.
--
-- Migration is idempotent and additive: only new columns and a check
-- constraint, plus a backfill of the existing rows. No data is dropped.
-- Runtime code catches `column .* does not exist` and short-circuits
-- with skippedReason='schema_not_ready' so it deploys ahead of apply.

-- ── Add state / error_code / null-safe value ─────────────────────────
alter table public.kpi_rollups_daily
  add column if not exists state text not null default 'ok';

alter table public.kpi_rollups_daily
  add column if not exists error_code text;

-- Existing schema had `value numeric(14,4) not null default 0`.
-- We keep the default (so old callers still work) but drop NOT NULL so
-- the cron can write NULL on non-ok rows without inventing a number.
alter table public.kpi_rollups_daily
  alter column value drop not null;

-- state ∈ {ok, stale, error}. 'stale' means "was ok recently, isn't now";
-- 'error' means "we can't derive it right now". Anything else is a bug.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'kpi_rollups_daily_state_check'
  ) then
    alter table public.kpi_rollups_daily
      add constraint kpi_rollups_daily_state_check
      check (state in ('ok','stale','error'));
  end if;
end $$;

-- If state != 'ok', we don't trust the number. Enforce it.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'kpi_rollups_daily_value_state_check'
  ) then
    alter table public.kpi_rollups_daily
      add constraint kpi_rollups_daily_value_state_check
      check (
        (state = 'ok' and value is not null)
        or (state <> 'ok')
      );
  end if;
end $$;

-- Helpful for filtering the admin queue of "which metrics broke today".
create index if not exists kpi_rollups_daily_state_idx
  on public.kpi_rollups_daily(state)
  where state <> 'ok';
