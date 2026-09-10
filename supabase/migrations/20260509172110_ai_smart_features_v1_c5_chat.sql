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
-- Contains: chatbot triage DDL + consolidated RLS/policy block for all 7 AI tables.

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
