-- Reference invitation resend and reminder delivery tracking.
alter table public.carer_references
  add column if not exists resend_count int not null default 0,
  add column if not exists last_resend_at timestamptz,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists reminder_stage int not null default 0 check (reminder_stage between 0 and 3);

create index if not exists carer_references_reminder_scan_idx
  on public.carer_references(status, reminder_stage, created_at)
  where status = 'invited';
