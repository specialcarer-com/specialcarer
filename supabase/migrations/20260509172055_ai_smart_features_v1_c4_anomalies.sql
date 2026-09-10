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
-- Contains: anomaly detection DDL + anomaly queue view.

-- 4) Anomaly detection
-- ============================================================

create table if not exists public.ai_anomaly_signals (
  id uuid primary key default gen_random_uuid(),
  -- no_show | late_check_in | route_deviation | early_check_out | location_gap | rating_drop
  kind text not null check (kind in
    ('no_show','late_check_in','route_deviation','early_check_out','location_gap','rating_drop')),
  severity text not null default 'low'
    check (severity in ('low','medium','high','critical')),
  booking_id uuid references public.bookings(id) on delete set null,
  caregiver_id uuid references public.caregiver_profiles(user_id) on delete set null,
  seeker_id uuid references public.profiles(id) on delete set null,
  -- Deviation magnitude — meaning depends on `kind`. e.g. minutes late, meters off route.
  magnitude numeric,
  -- Free-form facts the rule fired on.
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open'
    check (status in ('open','triaged','dismissed','resolved')),
  triaged_by uuid references auth.users(id) on delete set null,
  triaged_at timestamptz,
  resolution_notes text,
  detected_at timestamptz not null default now(),
  model_version text not null default 'v1.0'
);

create index if not exists ai_anomaly_signals_status_idx
  on public.ai_anomaly_signals (status, severity, detected_at desc);
create index if not exists ai_anomaly_signals_booking_idx
  on public.ai_anomaly_signals (booking_id);

-- ============================================================

-- 7) Anomaly queue view (joined with booking + carer for the admin UI)
-- ============================================================

create or replace view public.ai_anomaly_queue_v as
select
  a.id,
  a.kind,
  a.severity,
  a.status,
  a.magnitude,
  a.details,
  a.detected_at,
  a.booking_id,
  b.starts_at      as booking_starts_at,
  b.ends_at        as booking_ends_at,
  b.location_city  as booking_city,
  b.status         as booking_status,
  a.caregiver_id,
  cp.display_name  as caregiver_name,
  a.seeker_id,
  sp.full_name     as seeker_name
from public.ai_anomaly_signals a
left join public.bookings b on b.id = a.booking_id
left join public.caregiver_profiles cp on cp.user_id = a.caregiver_id
left join public.profiles sp on sp.id = a.seeker_id;

comment on view public.ai_anomaly_queue_v is
  'Open + recently-triaged anomaly signals with booking + carer context for the admin UI.';
