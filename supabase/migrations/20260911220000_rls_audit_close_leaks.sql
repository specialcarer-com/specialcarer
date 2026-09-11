-- ============================================================================
-- SpecialCarer — B1 / RLS audit: close the four holes flagged 2026-08-18
--
-- Migrations audited (evidence trail):
--   20260625121035_interview_rooms_v1.sql             (interviews, interview_rooms — no RLS at all)
--   20260509124649_training_v3_9.sql:50-75            (training_quiz_questions — anon/authenticated select on correct_index)
--   20260509114020_schedule_availability_v1.sql:16-30 (caregiver_blockouts — authenticated read of every row incl. reason)
--   20260512011206_agency_optin_v2_courses_population.sql (course_population_requirements — no RLS)
--
-- Freeze-respectful: idempotent throughout via pg_policies guards; additive;
-- runtime is written to survive both the pre-apply and post-apply state.
--
-- Trust boundaries preserved:
--   * interviews / interview_rooms — the only reader (src/app/api/m/interviews/[id]/room/route.ts)
--     uses the service-role admin client; enabling RLS is defence-in-depth.
--   * training_quiz_questions.correct_index — column-level REVOKE from anon
--     and authenticated. Server-side scoring (submit route) now uses admin.
--   * caregiver_blockouts — cross-user reads go through a minimum-necessary
--     view (dates only, no reason); base-table reads become owner-only.
--   * course_population_requirements — read-only for authenticated; write via
--     admin only.
-- ============================================================================


-- ── 1. interviews ─────────────────────────────────────────────────────────────
alter table public.interviews enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where policyname = 'interviews_participant_read'
       and tablename  = 'interviews'
  ) then
    create policy interviews_participant_read on public.interviews
      for select to authenticated
      using (
        carer_id  = (select auth.uid())
        or family_id = (select auth.uid())
      );
  end if;
end $$;

-- No client-side write policy: interviews are provisioned by the server via
-- the admin client. Service role bypasses RLS.


-- ── 2. interview_rooms ────────────────────────────────────────────────────────
alter table public.interview_rooms enable row level security;

-- Deliberately no SELECT policy for anon/authenticated: room URLs
-- (host_room_url / viewer_room_url) must never be readable client-side.
-- The only reader is the admin-client wrapper in
-- src/app/api/m/interviews/[id]/room/route.ts, which authorises the caller,
-- then returns the appropriate URL for that participant.
--
-- We add nothing here — RLS on with no policy = deny-all for
-- anon/authenticated, allow-all for service_role.


-- ── 3. training_quiz_questions — hide the answer key ──────────────────────────
-- The row-level policy stays as-is (published courses' questions are readable
-- so the mobile quiz page can render prompt/options/explanation). We revoke
-- column access to correct_index from client roles. Server-side scoring
-- (src/app/api/training/[slug]/quiz/submit/route.ts) now uses the admin
-- client, which retains full column access via service_role.

revoke select (correct_index) on public.training_quiz_questions from anon;
revoke select (correct_index) on public.training_quiz_questions from authenticated;

-- Explicit re-grants for the remaining columns (safer than relying on the
-- pre-existing table-level GRANT to still cover them). idempotent.
grant select (id, course_id, sort_order, prompt, options, explanation, created_at)
  on public.training_quiz_questions to anon, authenticated;

-- Insert/update/delete continue to require service_role — the admin content
-- editor routes are already admin-client.


-- ── 4. caregiver_blockouts — owner-only base table + safe public view ─────────
-- The pre-existing policy allowed every authenticated user to read every
-- carer's blockouts including the free-text reason. Tighten it:
--   * blockouts_public_read → owner-only (drop the USING(true) hole).
--   * new caregiver_blockouts_public view: dates only, no reason.
--   * matcher/service paths continue to read via the admin client (they
--     already do — see src/app/api/m/org/bookings/route.ts and
--     src/app/api/admin/timeoff/[id]/route.ts).

do $$ begin
  if exists (
    select 1 from pg_policies
     where policyname = 'blockouts_public_read'
       and tablename  = 'caregiver_blockouts'
  ) then
    drop policy blockouts_public_read on public.caregiver_blockouts;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where policyname = 'blockouts_self_read'
       and tablename  = 'caregiver_blockouts'
  ) then
    create policy blockouts_self_read on public.caregiver_blockouts
      for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

-- (blockouts_self_write already covers all-verb owner writes.)

-- Public view: only the fields a scheduling/matching UI legitimately needs.
create or replace view public.caregiver_blockouts_public as
  select user_id, starts_on, ends_on
    from public.caregiver_blockouts;

revoke all on public.caregiver_blockouts_public from anon, authenticated, public;
grant  select on public.caregiver_blockouts_public to authenticated, service_role;

comment on view public.caregiver_blockouts_public is
  'Minimum-necessary projection of caregiver_blockouts for cross-user reads: dates only, no reason. See RLS audit 2026-08-18 finding 4.';


-- ── 5. course_population_requirements — enable RLS + authenticated read ───────
alter table public.course_population_requirements enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where policyname = 'course_population_requirements_authenticated_read'
       and tablename  = 'course_population_requirements'
  ) then
    create policy course_population_requirements_authenticated_read
      on public.course_population_requirements
      for select to anon, authenticated
      using (true);
  end if;
end $$;

-- No client write policy — mandatory-course gates are seeded/edited by
-- migrations or admin scripts (service_role).


-- ── 6. Documentation stamps ───────────────────────────────────────────────────
comment on policy interviews_participant_read on public.interviews is
  'B1 (2026-09): carer or family participant may read their own interview row. Room URLs stay server-only via interview_rooms.';
comment on policy blockouts_self_read on public.caregiver_blockouts is
  'B1 (2026-09): base-table reads are owner-only. Cross-user readers use caregiver_blockouts_public (dates only) or the admin client.';
comment on policy course_population_requirements_authenticated_read on public.course_population_requirements is
  'B1 (2026-09): configuration is public-read; writes remain service_role.';
