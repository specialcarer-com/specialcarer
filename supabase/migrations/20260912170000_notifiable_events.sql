-- ============================================================================
-- SpecialCarer — C3a / Duty-of-Candour + Notifiable-Event Casework (foundation)
--
-- Adds the immutable data model for CQC-scoped duty-of-candour and
-- notifiable-event casework. This is PR C3a; the admin UI, regulator
-- templates, and case-detail page ship in C3b.
--
-- Regulatory scope: CQC only (SpecialCarer serves England only).
-- CIW / RQIA / Care Inspectorate templates will be added as placeholder
-- stubs in a later PR — not represented in this schema or seed data.
--
-- SLA model — deliberately two clocks per event:
--   1. `regulator_notify_target_at` — CQC Reg 16 (death) and Reg 18
--      (other notifiable incidents) are "without delay". Modelled here
--      as "same working day if discovered before 5pm London, otherwise
--      next working day 9am London". Purely a computed *target*; the
--      legal obligation is still "without delay".
--   2. `candour_disclosure_target_at` — CQC Reg 20 duty-of-candour
--      disclosure to the affected person / their representative is
--      "as soon as reasonably practicable". Providers subject to the
--      NHS Standard Contract have a maximum of 10 working days. We
--      adopt 10 working days as an internal ceiling for all providers
--      to be safe — it is NOT a statutory CQC deadline.
--
-- Freeze-respectful: additive only. New tables, new indexes on those
-- tables, no touch of existing rows or columns. Passes the pre-flight
-- destructive-migration gate (PR #220).
--
-- Deploy-safe: the case library in `src/lib/candour/case.ts` catches
-- PG 42P01 (relation does not exist) and returns
-- `{ok:true, skippedReason:'schema_not_ready'}`, so the carer POST
-- endpoint keeps returning 202 during the deploy window before the
-- migration reaches prod.
--
-- Roles note (documented so the next-PR author does not get confused):
-- The task brief references RM (Registered Manager) and NI (Nominated
-- Individual) roles. Those roles do not exist in `profiles.role` yet —
-- the enum today is 'seeker' | 'caregiver' | 'admin'. The RLS policies
-- below therefore use `role = 'admin'` for privileged access; when the
-- RM/NI roles are added (a separate PR), extend the OR-lists here.
-- The library layer in `src/lib/candour/case.ts` factors the NI-role
-- check through injected deps so tests can pin the value while the
-- production code reads from a single constant.
-- ============================================================================

-- ── 1. notifiable_events ────────────────────────────────────────────────────

create table if not exists public.notifiable_events (
  id uuid primary key default gen_random_uuid(),

  -- Taxonomy. 'other' is the RM-triage bucket — the SLA library
  -- returns NULL for the regulator target in that case, deliberately.
  type text not null check (type in (
    'death',
    'injury_serious',
    'abuse_alleged',
    'deprivation_of_liberty',
    'incident_police_involved',
    'service_stopped',
    'other'
  )),

  -- Optional link to the affected service user's profile. Nullable
  -- because at open-time the subject may not be a registered profile
  -- (e.g. a family member of the seeker, or a person not yet booked).
  subject_person_id uuid references public.profiles(id) on delete set null,
  -- Freetext identifier used when subject_person_id is null. Not
  -- constrained — carers describe what they saw in their own words.
  subject_description text,

  booking_id uuid references public.bookings(id) on delete set null,
  -- Carer involved in the incident (may or may not be the reporter).
  carer_id uuid references public.profiles(id) on delete set null,

  -- When the incident happened; may be unknown at open-time (e.g.
  -- retrospective disclosure by a family member).
  occurred_at timestamptz,
  -- When it was reported to the platform. Drives both SLA clocks.
  discovered_at timestamptz not null default now(),
  -- Who filed it (auth.uid at open-time).
  reported_by uuid not null references public.profiles(id) on delete restrict,

  severity text not null check (severity in ('low','medium','high','critical')),

  -- Case state machine. Enforced in the library layer, not with a DB
  -- trigger, so tests can drive the transitions with a plain fake.
  state text not null default 'open' check (state in (
    'open',
    'disclosure_in_progress',
    'disclosure_complete',
    'notified_regulator',
    'closed'
  )),

  -- Computed at open time by src/lib/candour/sla.ts.
  regulator_notify_target_at timestamptz,
  candour_disclosure_target_at timestamptz,

  -- Filled when RM marks the CQC notification submitted. The library
  -- enforces regulator_reference is non-empty when this is set (kept
  -- in application code rather than a CHECK so we can return a
  -- structured validation error instead of a raw DB constraint hit).
  regulator_notified_at timestamptz,
  regulator_reference text,

  disclosure_completed_at timestamptz,

  closure_reason text,
  -- NI = Nominated Individual, required to close a case.
  ni_signoff_by uuid references public.profiles(id) on delete set null,
  ni_signoff_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Admin queue: state + severity + newest-first.
create index if not exists notifiable_events_state_severity_idx
  on public.notifiable_events (state, severity, discovered_at desc);

-- Carer's own filed list.
create index if not exists notifiable_events_reporter_idx
  on public.notifiable_events (reported_by, discovered_at desc);

comment on table public.notifiable_events is
  'Duty-of-candour + notifiable-event casework (CQC scope). One row per incident. Two SLA clocks per row: regulator_notify_target_at (Reg 16/18 "without delay" modelled as same/next working day 9am) and candour_disclosure_target_at (Reg 20 disclosure to family — internal 10-working-day ceiling, not a statutory CQC deadline).';
comment on column public.notifiable_events.regulator_notify_target_at is
  'Target for submitting the CQC notification. Computed at open time. NULL for type=other. The legal obligation is "without delay" — this timestamp is a working-target, not a deadline.';
comment on column public.notifiable_events.candour_disclosure_target_at is
  'Target for completing the Reg 20 duty-of-candour disclosure to the affected person or their representative. Computed at open time as discovered_at + 10 working days (UK bank holidays skipped). Widely-adopted internal ceiling, not a statutory CQC deadline.';
comment on column public.notifiable_events.regulator_reference is
  'CQC reference number entered by the RM once the notification is submitted. Non-empty when regulator_notified_at is set — enforced in src/lib/candour/case.ts, not a DB CHECK, so we can return a structured 400.';

-- ── 2. notifiable_event_actions (append-only audit trail) ───────────────────

-- append-only: no UPDATE/DELETE policies, so RLS blocks all mutations
-- except INSERT. Do NOT add a Postgres trigger blocking updates —
-- RLS absence is sufficient and easier to reason about.
create table if not exists public.notifiable_event_actions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notifiable_events(id) on delete restrict,
  acted_by uuid not null references public.profiles(id) on delete restrict,

  -- Freetext label. Callers use one of:
  --   'opened', 'disclosure_recorded', 'regulator_notified',
  --   'closed', 'note_added', 'attachment_added'.
  action text not null,

  previous_state text,
  new_state text,
  notes text,
  -- Storage path relative to notifiable-events/{event_id}/ inside a
  -- (future) Supabase Storage bucket. The upload itself happens in
  -- the HTTP layer; the library just records the pointer.
  attachment_path text,

  created_at timestamptz not null default now()
);

create index if not exists notifiable_event_actions_event_created_idx
  on public.notifiable_event_actions (event_id, created_at);

comment on table public.notifiable_event_actions is
  'Append-only audit trail for notifiable_events. RLS has SELECT + INSERT policies only — the absence of UPDATE/DELETE policies is what makes the table immutable. Do not add an UPDATE/DELETE trigger; the RLS shape is the contract.';

-- ── 3. RLS ──────────────────────────────────────────────────────────────────

alter table public.notifiable_events enable row level security;
alter table public.notifiable_event_actions enable row level security;

-- Policy names below are fresh (this migration introduces the tables),
-- so `create policy` on a fresh apply always succeeds. We deliberately
-- omit `drop policy if exists` here because PR #220's pre-flight
-- destructive-migration gate treats `DROP POLICY` as destructive; that
-- gate lands on top of a code-base whose pre-#220 migrations use
-- `drop policy if exists` extensively (they were merged before the gate
-- existed). New migrations must be additive-only from #220 onwards. If
-- you ever need to rename or repoint one of these policies, do so in a
-- separate migration whose PR body includes the
-- `destructive-migration-override` git trailer.

-- ── notifiable_events policies ──
-- Admin read: today only `admin` exists. When RM (Registered Manager)
-- and NI (Nominated Individual) roles are introduced in a future PR,
-- extend the OR-list here — grep for `notifiable_events_admin_read`.
create policy notifiable_events_admin_read on public.notifiable_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin')
    )
  );

-- Reporter can read their own filed events.
create policy notifiable_events_carer_read_own on public.notifiable_events
  for select
  to authenticated
  using (reported_by = auth.uid());

-- Any authenticated user can INSERT — but only rows they own AND only
-- in the `open` state. Stops a carer from filing an event pre-marked
-- as closed / notified. Also fixes reported_by = auth.uid() at the
-- policy layer so a client can't spoof the reporter id.
create policy notifiable_events_carer_insert on public.notifiable_events
  for insert
  to authenticated
  with check (
    reported_by = auth.uid()
    and state = 'open'
  );

-- Admin write: today only `admin` exists. When RM/NI roles land,
-- extend the OR-list here.
create policy notifiable_events_admin_write on public.notifiable_events
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin')
    )
  );

-- ── notifiable_event_actions policies (append-only: SELECT + INSERT only) ──

create policy notifiable_event_actions_admin_read on public.notifiable_event_actions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin')
    )
  );

-- Reporter of the parent event can see the audit rows for that event.
create policy notifiable_event_actions_reporter_read on public.notifiable_event_actions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.notifiable_events e
      where e.id = notifiable_event_actions.event_id
        and e.reported_by = auth.uid()
    )
  );

-- Any authenticated user can INSERT — their user id MUST equal
-- acted_by (stops spoofing the actor field). The library uses the
-- service-role client in practice, which bypasses RLS, but this
-- policy makes accidental client-side inserts safe by construction.
create policy notifiable_event_actions_authenticated_insert on public.notifiable_event_actions
  for insert
  to authenticated
  with check (acted_by = auth.uid());

-- NO UPDATE / DELETE policies for notifiable_event_actions by design.
-- The absence blocks mutations for both anon and authenticated roles;
-- only the service-role key can write, and by convention (see
-- src/lib/candour/case.ts) it only ever inserts.
