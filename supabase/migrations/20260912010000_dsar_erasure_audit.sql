-- ============================================================================
-- SpecialCarer — C1 / DSAR erasure audit + deferred-hard-delete queue
--
-- The B7 migration (20260911234500_dsar_requests.sql) added the request
-- queue but not the machinery to *fulfil* an erasure. This migration adds
-- the two tables the erasure handler writes into:
--
--   1. dsar_erasure_audit — one row per (dsar_request, table, column,
--      action). Written synchronously by the erasure handler. Retained
--      for 6 years per the retention map, so the ICO can be shown that
--      a request was honoured and exactly what happened.
--
--   2. dsar_deferred_erasure_queue — rows scheduled for hard-delete on
--      a future date because UK law requires them to be kept for a
--      defined period (payroll 3y, accounting 6y, minors' care records
--      until 25th birthday, safeguarding referrals about minors 75y).
--      The nightly retention cron (follow-up PR) reads this queue.
--
-- We also expand the state constraint on dsar_requests to accept two
-- new terminal / intermediate values:
--
--   * 'erased'              — Article-17 request fulfilled synchronously
--                             (everything that could be nulled *was*
--                             nulled today; retained rows are recorded
--                             separately in the audit table).
--   * 'retention_scheduled' — intermediate state used only if the
--                             fulfilment cron needs a signal that
--                             erasure was authorised but not yet
--                             executed. Reserved for future use; the
--                             handler in C1 writes directly to
--                             'erased' when it finishes.
--
-- Deploy-safe pattern: additive, idempotent, no data-touching. Handler
-- code degrades to `schema_not_ready` when these tables are absent so
-- pre-migration environments behave exactly as today (no erasure route).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.dsar_erasure_audit (
  id uuid primary key default gen_random_uuid(),

  -- The request that authorised this action. Erasure runs write many
  -- rows here per request (one per manifest step).
  dsar_request_id uuid not null references public.dsar_requests(id) on delete restrict,

  -- The subject the action applied to. Never nulled — the whole point
  -- of the audit trail is that it survives the subject's account.
  subject_email text not null,
  subject_user_id uuid,

  -- Manifest step co-ordinates.
  table_name text not null,
  column_name text,
  owner_column text,
  owner_value text,

  -- What the handler did. Matches the retention map vocabulary:
  --   'null'          — column set to NULL
  --   'pseudonymise'  — column set to a stable per-subject pseudonym
  --   'anonymise'     — irreversible transform (no key kept)
  --   'retain'        — declined under Art. 17(3)(b) / (e)
  --   'soft-delete'   — deleted_at set + row queued for hard-delete
  --   'skip'          — manifest step skipped (schema not ready, etc.)
  action text not null check (action in
    ('null','pseudonymise','anonymise','retain','soft-delete','skip')),

  -- Free-text explanation the handler emits. For 'retain' this is the
  -- legal basis quoted from the retention map; for 'skip' it is the
  -- reason (usually 'schema_not_ready').
  reason text,

  -- For 'retain' and 'soft-delete': when the data can finally be
  -- purged. For the other actions this is null.
  retained_until date,

  -- Number of rows the action affected. 0 is legitimate — e.g.
  -- 'safeguarding_alerts' rows may not exist for a given subject.
  row_count integer not null default 0,

  -- Whether the DB call errored. Errors do not abort the handler; each
  -- step is recorded pass or fail.
  error text,

  executed_at timestamptz not null default now()
);

create index if not exists dsar_erasure_audit_request_idx
  on public.dsar_erasure_audit(dsar_request_id, executed_at);

create index if not exists dsar_erasure_audit_subject_idx
  on public.dsar_erasure_audit(subject_email, executed_at desc);

comment on table public.dsar_erasure_audit is
  'One row per (request, table, column, action) written by handleDsarErase. Retained 6 years per the DSAR retention map. Never expose to the subject verbatim; use the summary in the completion email.';

comment on column public.dsar_erasure_audit.action is
  'One of null / pseudonymise / anonymise / retain / soft-delete / skip. Matches the retention-map vocabulary.';

alter table public.dsar_erasure_audit enable row level security;

-- Admins read all rows. No self-read for subjects — the completion
-- email already tells them what happened in aggregate; the raw audit
-- trail includes staff/system columns.
drop policy if exists dsar_erasure_audit_admin_read on public.dsar_erasure_audit;
create policy dsar_erasure_audit_admin_read on public.dsar_erasure_audit
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- No INSERT/UPDATE/DELETE policies granted — all writes land through the
-- service-role client from the erasure handler.

-- ---------------------------------------------------------------------------
-- 2) Deferred hard-delete queue
-- ---------------------------------------------------------------------------
create table if not exists public.dsar_deferred_erasure_queue (
  id uuid primary key default gen_random_uuid(),

  dsar_request_id uuid not null references public.dsar_requests(id) on delete restrict,
  subject_email text not null,
  subject_user_id uuid,

  -- What to hard-delete when the timer fires.
  table_name text not null,
  owner_column text not null,
  owner_value text not null,

  -- If null: DELETE the whole row. If set: UPDATE ... SET column_name = null.
  column_name text,

  -- When the retention obligation expires and hard-delete may run.
  retained_until date not null,

  -- Cron state machine.
  state text not null default 'pending'
    check (state in ('pending','processing','completed','skipped','error')),

  -- Retry bookkeeping. The cron retries a failed row nightly for 7 days
  -- then flips state='skipped' and files an admin_audit_log row.
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  completed_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists dsar_deferred_queue_due_idx
  on public.dsar_deferred_erasure_queue(retained_until, state)
  where state in ('pending','error');

create index if not exists dsar_deferred_queue_request_idx
  on public.dsar_deferred_erasure_queue(dsar_request_id);

comment on table public.dsar_deferred_erasure_queue is
  'Rows scheduled for a future hard-delete because UK law required them retained past the erasure request date. Read nightly by the dsar-deferred-erasure cron (follow-up PR).';

alter table public.dsar_deferred_erasure_queue enable row level security;

drop policy if exists dsar_deferred_queue_admin_read on public.dsar_deferred_erasure_queue;
create policy dsar_deferred_queue_admin_read on public.dsar_deferred_erasure_queue
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- No other policies — all writes go through the service-role client.

-- ---------------------------------------------------------------------------
-- 3) Expand dsar_requests.state check constraint
--
-- B7 defined: submitted / verifying / in_progress / delivered / rejected / cancelled.
-- Add: erased (terminal, Art-17 fulfilled) and retention_scheduled
-- (reserved intermediate).
--
-- Idempotent replacement: drop the old constraint if it exists, add the
-- widened one. `alter table ... drop constraint if exists` is a no-op
-- on environments where the constraint has a different name.
-- ---------------------------------------------------------------------------
do $$
declare
  cons record;
begin
  -- Find the state check constraint by shape rather than name, since
  -- the auto-generated name may vary.
  for cons in
    select con.conname
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace n on n.oid = cls.relnamespace
     where n.nspname = 'public'
       and cls.relname = 'dsar_requests'
       and con.contype = 'c'
       and (
         -- pg pretty-prints `state IN (...)` as `state = ANY (ARRAY[...])`
         -- on modern versions; match either shape by looking for
         -- 'state' and 'submitted' both appearing anywhere in the def.
         pg_get_constraintdef(con.oid) ilike '%state%in%submitted%'
         or pg_get_constraintdef(con.oid) ilike '%state%submitted%'
       )
  loop
    execute format('alter table public.dsar_requests drop constraint %I', cons.conname);
  end loop;
end $$;

alter table public.dsar_requests
  add constraint dsar_requests_state_check
  check (state in (
    'submitted',
    'verifying',
    'in_progress',
    'delivered',
    'rejected',
    'cancelled',
    'erased',
    'retention_scheduled'
  ));
