-- Phase 4 stage 1 — Holiday Pot Ledger (UK).
--
-- Adds a per-carer signed ledger of holiday-pot movements (accrual, paid-leave
-- debit, manual adjustment, expiry) so the 12.07% accrual already computed per
-- UK monthly payslip becomes a queryable, withdrawable balance.
--
-- Strictly additive — no existing table or column is dropped or altered. The
-- legacy `carer_holiday_pots` summary table continues to work in parallel; the
-- ledger is the new source of truth and will eventually replace it.
--
-- Spec: phase4-spec.md (Item B) — objective: phase4-holiday-pot-objective.md.

-- 1. holiday_pot_ledger ------------------------------------------------------
create table if not exists public.holiday_pot_ledger (
  id                   uuid primary key default gen_random_uuid(),
  carer_id             uuid not null references public.profiles(id) on delete cascade,
  entry_type           text not null check (entry_type in
                         ('accrued','debited_paid_leave','adjusted','expired')),
  amount_cents         integer not null,
  hours                numeric(6,2),
  payroll_run_id       uuid references public.payroll_runs(id),
  org_carer_payout_id  uuid references public.org_carer_payouts(id),
  leave_request_id     uuid,
  notes                text,
  created_at           timestamptz not null default now()
);

create index if not exists idx_holiday_pot_ledger_carer_created
  on public.holiday_pot_ledger (carer_id, created_at desc);

-- Idempotency for the engine's auto-accrual hook: at most one 'accrued'
-- entry per payout. Other entry types are unconstrained (a single payout
-- could in theory be both accrued and later adjusted).
create unique index if not exists holiday_pot_ledger_accrued_unique
  on public.holiday_pot_ledger (org_carer_payout_id)
  where entry_type = 'accrued';

alter table public.holiday_pot_ledger enable row level security;

-- carer-self-read
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'holiday_pot_ledger_self_read'
      and tablename = 'holiday_pot_ledger'
  ) then
    create policy holiday_pot_ledger_self_read on public.holiday_pot_ledger
      for select to authenticated
      using (carer_id = (select auth.uid()));
  end if;
end $$;

-- admin-read-all
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'holiday_pot_ledger_admin_read'
      and tablename = 'holiday_pot_ledger'
  ) then
    create policy holiday_pot_ledger_admin_read on public.holiday_pot_ledger
      for select to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'admin'
        )
      );
  end if;
end $$;

-- Writes are service-role only — no insert/update/delete policy for
-- 'authenticated', so RLS denies by default.

-- 2. leave_requests ----------------------------------------------------------
create table if not exists public.leave_requests (
  id                       uuid primary key default gen_random_uuid(),
  carer_id                 uuid not null references public.profiles(id) on delete cascade,
  requested_hours          numeric(6,2) not null check (requested_hours > 0),
  requested_amount_cents   integer not null,
  status                   text not null default 'pending' check (status in
                             ('pending','approved','rejected','cancelled','paid')),
  reason                   text,
  start_date               date,
  end_date                 date,
  admin_id                 uuid references public.profiles(id),
  admin_notes              text,
  decided_at               timestamptz,
  paid_at                  timestamptz,
  paid_via_run_id          uuid references public.payroll_runs(id),
  created_at               timestamptz not null default now()
);

create index if not exists idx_leave_requests_carer_status_created
  on public.leave_requests (carer_id, status, created_at desc);

alter table public.leave_requests enable row level security;

-- carer-self read
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'leave_requests_self_read'
      and tablename = 'leave_requests'
  ) then
    create policy leave_requests_self_read on public.leave_requests
      for select to authenticated
      using (carer_id = (select auth.uid()));
  end if;
end $$;

-- carer-self insert (only when status = 'pending')
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'leave_requests_self_insert'
      and tablename = 'leave_requests'
  ) then
    create policy leave_requests_self_insert on public.leave_requests
      for insert to authenticated
      with check (
        carer_id = (select auth.uid())
        and status = 'pending'
      );
  end if;
end $$;

-- admin all
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'leave_requests_admin_all'
      and tablename = 'leave_requests'
  ) then
    create policy leave_requests_admin_all on public.leave_requests
      for all to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'admin'
        )
      );
  end if;
end $$;

-- 3. v_holiday_pot_balances --------------------------------------------------
create or replace view public.v_holiday_pot_balances as
select carer_id,
       coalesce(sum(amount_cents) filter (where entry_type = 'accrued'), 0)            as accrued_cents,
       coalesce(sum(amount_cents) filter (where entry_type = 'debited_paid_leave'), 0) as debited_cents,
       coalesce(sum(amount_cents) filter (where entry_type = 'adjusted'), 0)           as adjusted_cents,
       coalesce(sum(amount_cents) filter (where entry_type = 'expired'), 0)            as expired_cents,
       coalesce(sum(amount_cents), 0)                                                   as balance_cents,
       max(created_at)                                                                  as last_entry_at
  from public.holiday_pot_ledger
 group by carer_id;

comment on view public.v_holiday_pot_balances is
  'Phase 4 stage 1: one row per carer with their current holiday-pot balance derived from the ledger. debited_paid_leave and expired entries are stored as negative amounts so balance_cents is a plain sum.';

comment on table public.holiday_pot_ledger is
  'Phase 4 stage 1: signed ledger of holiday-pot movements (+ accrued, − debited/expired, ± adjusted). Source of truth for v_holiday_pot_balances.';

comment on table public.leave_requests is
  'Phase 4 stage 1: carer-initiated request to draw down accrued holiday pot. Admin approves → payroll engine later writes the matching ledger debit and pays via the next run (Phase 4 stage 2).';
