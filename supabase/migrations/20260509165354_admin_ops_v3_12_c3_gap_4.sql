-- Admin Ops v3.12 — split chunk for ledger alignment.
-- Original bundle: supabase/migrations/20260509_admin_ops_v3_12.sql
-- Split at logical Gap boundaries; all sub-files remain idempotent.
--
-- Contains Gap 4 (customer support ticketing).

-- ─── Gap 4: Native customer support ticketing ───────────────────────
create sequence if not exists public.support_tickets_number_seq start with 1001;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint not null unique
    default nextval('public.support_tickets_number_seq'),
  subject text not null check (length(subject) between 1 and 200),
  status text not null default 'open'
    check (status in ('open','pending','resolved','closed')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  user_id uuid references auth.users(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  channel text not null default 'web'
    check (channel in ('web','email','app','phone')),
  tags text[] not null default '{}',
  sla_due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_status_idx
  on public.support_tickets(status);
create index if not exists support_tickets_priority_idx
  on public.support_tickets(priority);
create index if not exists support_tickets_assigned_idx
  on public.support_tickets(assigned_to);
create index if not exists support_tickets_user_idx
  on public.support_tickets(user_id);

create or replace function public.support_tickets_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'support_tickets_touch_trg'
  ) then
    create trigger support_tickets_touch_trg
      before update on public.support_tickets
      for each row execute function public.support_tickets_touch();
  end if;
end $$;

alter table public.support_tickets enable row level security;
-- Reporter (user_id) can read & insert their own; admins can do anything.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'support_tickets_user_insert'
      and tablename = 'support_tickets'
  ) then
    create policy support_tickets_user_insert on public.support_tickets
      for insert to authenticated
      with check (user_id = (select auth.uid()));
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'support_tickets_user_select'
      and tablename = 'support_tickets'
  ) then
    create policy support_tickets_user_select on public.support_tickets
      for select to authenticated
      using (
        user_id = (select auth.uid())
        or exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'support_tickets_admin_update'
      and tablename = 'support_tickets'
  ) then
    create policy support_tickets_admin_update on public.support_tickets
      for update to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      )
      with check (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id)
    on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_role text not null check (author_role in ('user','admin','system')),
  body text not null check (length(body) between 1 and 10000),
  attachments jsonb not null default '[]',
  internal_note boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket_idx
  on public.support_messages(ticket_id, created_at);

alter table public.support_messages enable row level security;
-- A user can read non-internal messages on their own tickets; admins
-- read everything. Inserts are scoped: a user posts as 'user', admin
-- posts as 'admin' (or 'system').
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'support_messages_select'
      and tablename = 'support_messages'
  ) then
    create policy support_messages_select on public.support_messages
      for select to authenticated
      using (
        (
          internal_note = false
          and exists (
            select 1 from public.support_tickets t
            where t.id = ticket_id and t.user_id = (select auth.uid())
          )
        )
        or exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'support_messages_user_insert'
      and tablename = 'support_messages'
  ) then
    create policy support_messages_user_insert on public.support_messages
      for insert to authenticated
      with check (
        (
          author_role = 'user'
          and author_id = (select auth.uid())
          and internal_note = false
          and exists (
            select 1 from public.support_tickets t
            where t.id = ticket_id and t.user_id = (select auth.uid())
          )
        )
        or exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;

