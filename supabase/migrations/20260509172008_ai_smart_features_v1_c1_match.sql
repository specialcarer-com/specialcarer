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
-- Contains: smart matching DDL only.

-- AI / Smart Features v1
-- Adds: smart matching, predictive scheduling, care-notes summarization,
-- anomaly detection, and chatbot triage.
--
-- Design notes:
--  * All AI tables are append-only logs except cached snapshots
--    (ai_match_features, ai_schedule_predictions, ai_care_summaries).
--  * RLS enabled on every table. Admin-only writes for derived tables.
--  * No external LLM is called from the DB. Compute happens in app code,
--    results land here so the UI can read fast.
--  * Heuristic v1 — model_version starts at 'v1.0' so we can swap in a real
--    embedding/LLM pipeline later without schema churn.

-- ============================================================

-- 1) Smart matching
-- ============================================================

create table if not exists public.ai_match_features (
  caregiver_id uuid primary key references public.caregiver_profiles(user_id) on delete cascade,
  -- Aggregated signal vector. JSON keeps us flexible.
  --   completion_rate numeric  0..1
  --   on_time_rate    numeric  0..1
  --   avg_rating      numeric  0..5
  --   review_count    integer
  --   tenure_days     integer
  --   no_show_count_90d integer
  --   service_mix     jsonb    {"elderly_care": 12, "childcare": 3, ...}
  --   pref_postcodes  text[]
  signals jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  model_version text not null default 'v1.0'
);

create index if not exists ai_match_features_computed_idx
  on public.ai_match_features (computed_at desc);

-- Cached top-N matches per (seeker_id, service_type). Recomputed on demand
-- and refreshed nightly for active seekers.
create table if not exists public.ai_match_scores (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references public.profiles(id) on delete cascade,
  caregiver_id uuid not null references public.caregiver_profiles(user_id) on delete cascade,
  service_type text not null,
  score numeric not null check (score >= 0 and score <= 1),
  -- Per-feature contribution (sums approx to score, not strict).
  breakdown jsonb not null default '{}'::jsonb,
  -- Why this carer ranked where they did. Short bullets for UX.
  reasons text[] not null default '{}',
  computed_at timestamptz not null default now(),
  model_version text not null default 'v1.0',
  unique (seeker_id, caregiver_id, service_type)
);

create index if not exists ai_match_scores_seeker_score_idx
  on public.ai_match_scores (seeker_id, service_type, score desc);

-- ============================================================
