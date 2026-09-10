-- AI/Smart Features v1 — split chunk for ledger alignment.
-- Original bundle: supabase/migrations/20260509_ai_smart_features_v1.sql
-- Split at content-area boundaries. To keep RLS + policy content
-- byte-identical to the original bundle, all RLS/policy statements
-- were consolidated into the final chunk (c5_chat). The referenced
-- tables (ai_match_features, ai_match_scores, ai_schedule_predictions,
-- ai_care_summaries, ai_anomaly_signals) are created in earlier
-- chunks; because Supabase applies migrations in lexicographic order
-- and all statements are idempotent, running c5_chat after c1..c4
-- succeeds regardless of prior application state.
--
-- Contains: predictive scheduling DDL only.

-- 2) Predictive scheduling
-- ============================================================

create table if not exists public.ai_schedule_predictions (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references public.profiles(id) on delete cascade,
  -- 0=Sun..6=Sat, matches Postgres extract(dow ...)
  weekday smallint not null check (weekday between 0 and 6),
  -- 0..23 local hour
  hour smallint not null check (hour between 0 and 23),
  service_type text not null,
  caregiver_id uuid references public.caregiver_profiles(user_id) on delete set null,
  -- Booking history density: how many times this seeker has booked this slot.
  occurrences integer not null default 0,
  -- 0..1 how confident we are this is a recurring pattern.
  confidence numeric not null default 0,
  -- Suggestion is "live" until either the seeker accepts, dismisses,
  -- or 30 days pass without action.
  suggestion_status text not null default 'pending'
    check (suggestion_status in ('pending','accepted','dismissed','expired')),
  acted_at timestamptz,
  next_suggested_at timestamptz,
  computed_at timestamptz not null default now(),
  model_version text not null default 'v1.0',
  unique (seeker_id, weekday, hour, service_type)
);

create index if not exists ai_schedule_predictions_seeker_idx
  on public.ai_schedule_predictions (seeker_id, suggestion_status, confidence desc);

-- ============================================================
