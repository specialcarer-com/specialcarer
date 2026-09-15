-- ============================================================================
-- SpecialCarer — F1a / DSAR verification-error column
--
-- The public submit route (POST /api/dsar/submit) sends a verification
-- email at the end of the flow. Prior to F1a it awaited sendEmail(...)
-- without checking the returned .ok — if Resend/SMTP rejected the send
-- (invalid RESEND_API_KEY, bad EMAIL_FROM, quota, etc.), the row was
-- left in state='verifying' forever with no signal in the DB and no
-- visibility in the admin queue. This cost ~3 hours of prod debugging
-- on 15 Sep 2026 (see /home/user/workspace/phase_f/phase_f_plan.md).
--
-- This migration adds a nullable text column to record the send error
-- so the submit handler can flip the row to state='failed' and stamp
-- the underlying reason. The admin queue view can then surface it.
--
-- Deploy-safe: additive, nullable, no backfill required. Pre-existing
-- rows keep NULL. Older application code that doesn't know about this
-- column continues to work — INSERT/UPDATE statements without the
-- column simply leave it NULL.
-- ============================================================================

alter table public.dsar_requests
  add column if not exists verification_error text;

comment on column public.dsar_requests.verification_error is
  'Populated by the submit handler when the verification email send fails (Resend/SMTP rejection). Presence of this column with a non-null value AND state=''failed'' means the row needs admin follow-up: either retry send or contact the subject via an alternate channel. Never surface the raw text to the subject — it may leak provider-side detail.';

-- Also allow ''failed'' as a valid state value. The existing CHECK
-- constraint listed submitted/verifying/in_progress/delivered/rejected/
-- cancelled; ''failed'' is a new terminal state for post-verification
-- send failures.
--
-- We drop and re-create the constraint idempotently. The old name
-- follows Postgres's default (public.dsar_requests_state_check) but
-- we look it up defensively rather than hard-coding.
do $$
declare
  cname text;
begin
  select conname
    into cname
    from pg_constraint
    where conrelid = 'public.dsar_requests'::regclass
      and pg_get_constraintdef(oid) like '%state%in%';
  if cname is not null then
    execute format('alter table public.dsar_requests drop constraint %I', cname);
  end if;
end$$;

alter table public.dsar_requests
  add constraint dsar_requests_state_check
  check (state in (
    'submitted',
    'verifying',
    'in_progress',
    'delivered',
    'rejected',
    'cancelled',
    'failed'
  ));
