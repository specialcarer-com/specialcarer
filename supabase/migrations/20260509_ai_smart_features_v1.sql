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
-- 5) Chatbot triage
-- ============================================================

create table if not exists public.ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  -- Anonymous web visitors get a session id but no user_id.
  anon_session_id text,
  -- Where it started: web | mobile | help-center
  surface text not null default 'web',
  -- Resolution: bot_resolved | escalated | abandoned | open
  outcome text not null default 'open'
    check (outcome in ('open','bot_resolved','escalated','abandoned')),
  ticket_id uuid references public.support_tickets(id) on delete set null,
  intent text,
  -- Last bot-suggested action / intent confidence.
  last_intent_confidence numeric,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists ai_chat_sessions_user_idx
  on public.ai_chat_sessions (user_id, created_at desc);
create index if not exists ai_chat_sessions_outcome_idx
  on public.ai_chat_sessions (outcome, created_at desc);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_chat_sessions(id) on delete cascade,
  role text not null check (role in ('user','bot','agent','system')),
  body text not null,
  -- Bot-only metadata: matched intent, retrieved KB articles, suggested actions.
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_messages_session_idx
  on public.ai_chat_messages (session_id, created_at);

-- ============================================================
-- 6) RLS — enable on all + minimal policies
-- ============================================================

alter table public.ai_match_features      enable row level security;
alter table public.ai_match_scores        enable row level security;
alter table public.ai_schedule_predictions enable row level security;
alter table public.ai_care_summaries      enable row level security;
alter table public.ai_anomaly_signals     enable row level security;
alter table public.ai_chat_sessions       enable row level security;
alter table public.ai_chat_messages       enable row level security;

-- Admin can read/write everything. Existing app uses a `role = 'admin'` check
-- on public.profiles for staff users.
do $$
begin
  -- ai_match_features: admin r/w; nobody else.
  if not exists (select 1 from pg_policies where policyname = 'ai_match_features_admin_all') then
    create policy ai_match_features_admin_all on public.ai_match_features
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
  end if;

  -- ai_match_scores: admin r/w. Seeker can read their own scores.
  if not exists (select 1 from pg_policies where policyname = 'ai_match_scores_admin_all') then
    create policy ai_match_scores_admin_all on public.ai_match_scores
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'ai_match_scores_seeker_read') then
    create policy ai_match_scores_seeker_read on public.ai_match_scores
      for select to authenticated
      using (seeker_id = auth.uid());
  end if;

  -- ai_schedule_predictions: admin r/w. Seeker can read + update suggestion_status of their own.
  if not exists (select 1 from pg_policies where policyname = 'ai_schedule_predictions_admin_all') then
    create policy ai_schedule_predictions_admin_all on public.ai_schedule_predictions
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'ai_schedule_predictions_seeker_read') then
    create policy ai_schedule_predictions_seeker_read on public.ai_schedule_predictions
      for select to authenticated
      using (seeker_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'ai_schedule_predictions_seeker_update') then
    create policy ai_schedule_predictions_seeker_update on public.ai_schedule_predictions
      for update to authenticated
      using (seeker_id = auth.uid())
      with check (seeker_id = auth.uid());
  end if;

  -- ai_care_summaries: admin r/w. Family members can read summaries tied to their family.
  if not exists (select 1 from pg_policies where policyname = 'ai_care_summaries_admin_all') then
    create policy ai_care_summaries_admin_all on public.ai_care_summaries
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'ai_care_summaries_family_read') then
    create policy ai_care_summaries_family_read on public.ai_care_summaries
      for select to authenticated
      using (
        family_id is not null and exists (
          select 1 from public.family_members fm
          where fm.family_id = ai_care_summaries.family_id and fm.user_id = auth.uid()
        )
      );
  end if;

  -- ai_anomaly_signals: admin only. (Carer/seeker visibility is handled at the app layer.)
  if not exists (select 1 from pg_policies where policyname = 'ai_anomaly_signals_admin_all') then
    create policy ai_anomaly_signals_admin_all on public.ai_anomaly_signals
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
  end if;

  -- ai_chat_sessions / ai_chat_messages: admin r/w + owner r/w.
  if not exists (select 1 from pg_policies where policyname = 'ai_chat_sessions_admin_all') then
    create policy ai_chat_sessions_admin_all on public.ai_chat_sessions
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'ai_chat_sessions_owner_rw') then
    create policy ai_chat_sessions_owner_rw on public.ai_chat_sessions
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where policyname = 'ai_chat_messages_admin_all') then
    create policy ai_chat_messages_admin_all on public.ai_chat_messages
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'ai_chat_messages_owner_rw') then
    create policy ai_chat_messages_owner_rw on public.ai_chat_messages
      for all to authenticated
      using (
        exists (
          select 1 from public.ai_chat_sessions s
          where s.id = ai_chat_messages.session_id and s.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.ai_chat_sessions s
          where s.id = ai_chat_messages.session_id and s.user_id = auth.uid()
        )
      );
  end if;
end $$;

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
