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
-- Contains: care-notes summarization DDL only.

-- 3) Care-notes summarization
-- ============================================================

create table if not exists public.ai_care_summaries (
  id uuid primary key default gen_random_uuid(),
  -- One of:
  --   booking — single shift summary from journal entries
  --   weekly  — rolling 7-day summary across recipient
  --   monthly — rolling 30-day summary across recipient
  scope text not null check (scope in ('booking','weekly','monthly')),
  booking_id uuid references public.bookings(id) on delete cascade,
  recipient_id uuid references public.household_recipients(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  period_start timestamptz,
  period_end timestamptz,
  -- 1-2 sentence headline ("Mum had a calm day. Two short walks, ate well.")
  headline text not null,
  -- Bullet list, ≤ 6 items.
  bullets text[] not null default '{}',
  -- Mood trend across journal entries: positive | neutral | mixed | concern
  mood_trend text not null default 'neutral'
    check (mood_trend in ('positive','neutral','mixed','concern')),
  -- Concrete things flagged for follow-up.
  flags text[] not null default '{}',
  source_entry_ids uuid[] not null default '{}',
  computed_at timestamptz not null default now(),
  model_version text not null default 'v1.0'
);

create index if not exists ai_care_summaries_recipient_idx
  on public.ai_care_summaries (recipient_id, scope, computed_at desc);
create index if not exists ai_care_summaries_booking_idx
  on public.ai_care_summaries (booking_id, computed_at desc);

-- ============================================================
