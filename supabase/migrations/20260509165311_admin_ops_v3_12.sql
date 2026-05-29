-- Admin Ops 3.12 — operations dashboard expansion. Adds: ID re-verify
-- columns on background_checks, caregiver application-pipeline column
-- + history table, marketplace heatmap + surge rules + events,
-- native support ticketing (tickets + messages), built-in CMS (posts +
-- faqs + banners), compliance documents + view, finance enhancements
-- (payouts, fraud signals, tax docs), and KPI rollups for analytics.
--
-- Idempotent. RLS enabled on every new table; admin gating is the
-- existing pattern: `exists (select 1 from public.profiles p where
-- p.id = (select auth.uid()) and p.role = 'admin')` — service-role
-- always bypasses RLS.
--
-- The file is split into a Schema (DDL) section and a Seed (DML)
-- section so the parent agent can apply chunks independently.

-- ════════════════════════════════════════════════════════════════════
-- ── Schema ──────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════════

-- ─── Gap 1: Recurring ID re-verification ────────────────────────────
-- Extend background_checks (created out-of-band; we cannot recreate it,
-- only ADD COLUMN IF NOT EXISTS additively).
do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'background_checks'
  ) then
    alter table public.background_checks
      add column if not exists next_reverify_at date;
    alter table public.background_checks
      add column if not exists reverify_cadence_months int not null default 12;
    alter table public.background_checks
      add column if not exists reverify_status text not null default 'none'
        check (reverify_status in
          ('none','due','overdue','in_progress','cleared'));
  end if;
end $$;

-- Helper view: caregivers due for re-verification. View materialises
-- the join with profiles for the admin queue. Defined CREATE OR REPLACE
-- so it is safe to re-run.
create or replace view public.reverify_queue_v as
  select
    bc.id as background_check_id,
    bc.user_id,
    p.full_name,
    u.email,
    bc.check_type,
    bc.vendor,
    bc.status as check_status,
    bc.issued_at,
    bc.expires_at,
    bc.next_reverify_at,
    bc.reverify_cadence_months,
    bc.reverify_status,
    case
      when bc.next_reverify_at is null then null
      else (bc.next_reverify_at - current_date)
    end as due_in_days
  from public.background_checks bc
  left join public.profiles p on p.id = bc.user_id
  left join auth.users u on u.id = bc.user_id;
grant select on public.reverify_queue_v to authenticated;

-- ─── Gap 2: Caregiver application pipeline ──────────────────────────
do $$ begin
  if not exists (
    select 1 from pg_type where typname = 'caregiver_application_stage'
  ) then
    create type public.caregiver_application_stage as enum (
      'applied','screening','interview','background_check',
      'training','activated','rejected'
    );
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'caregiver_profiles'
  ) then
    alter table public.caregiver_profiles
      add column if not exists application_stage
        public.caregiver_application_stage not null default 'applied';
    alter table public.caregiver_profiles
      add column if not exists stage_entered_at timestamptz not null
        default now();
  end if;
end $$;

create table if not exists public.caregiver_stage_history (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  from_stage public.caregiver_application_stage,
  to_stage public.caregiver_application_stage not null,
  moved_by uuid references auth.users(id) on delete set null,
  moved_at timestamptz not null default now(),
  note text
);
create index if not exists caregiver_stage_history_carer_idx
  on public.caregiver_stage_history(caregiver_id, moved_at desc);

alter table public.caregiver_stage_history enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'caregiver_stage_history_admin_select'
      and tablename = 'caregiver_stage_history'
  ) then
    create policy caregiver_stage_history_admin_select
      on public.caregiver_stage_history
      for select to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'caregiver_stage_history_admin_insert'
      and tablename = 'caregiver_stage_history'
  ) then
    create policy caregiver_stage_history_admin_insert
      on public.caregiver_stage_history
      for insert to authenticated
      with check (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;

-- ─── Gap 3: Marketplace ops heatmap + auto-surge ────────────────────
create table if not exists public.marketplace_demand_snapshots (
  id uuid primary key default gen_random_uuid(),
  taken_at timestamptz not null default now(),
  city_slug text not null,
  vertical text not null,
  demand_score numeric(8,2) not null default 0,
  supply_score numeric(8,2) not null default 0,
  fill_rate numeric(4,3) not null default 0
    check (fill_rate >= 0 and fill_rate <= 1),
  hour_of_day int not null check (hour_of_day between 0 and 23)
);
create index if not exists marketplace_demand_snapshots_when_idx
  on public.marketplace_demand_snapshots(taken_at desc);
create index if not exists marketplace_demand_snapshots_city_vertical_idx
  on public.marketplace_demand_snapshots(city_slug, vertical, taken_at desc);

alter table public.marketplace_demand_snapshots enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'demand_snapshots_admin_select'
      and tablename = 'marketplace_demand_snapshots'
  ) then
    create policy demand_snapshots_admin_select
      on public.marketplace_demand_snapshots
      for select to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;

create table if not exists public.surge_rules (
  id uuid primary key default gen_random_uuid(),
  city_slug text not null,
  vertical text not null,
  condition_jsonb jsonb not null default '{}',
  multiplier numeric(3,2) not null default 1.30
    check (multiplier >= 1.00 and multiplier <= 1.50),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists surge_rules_city_vertical_idx
  on public.surge_rules(city_slug, vertical);

alter table public.surge_rules enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'surge_rules_admin_all'
      and tablename = 'surge_rules'
  ) then
    create policy surge_rules_admin_all on public.surge_rules
      for all to authenticated
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

create table if not exists public.surge_events (
  id uuid primary key default gen_random_uuid(),
  city_slug text not null,
  vertical text not null,
  multiplier numeric(3,2) not null
    check (multiplier >= 1.00 and multiplier <= 1.50),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  reason text,
  rule_id uuid references public.surge_rules(id) on delete set null
);
create index if not exists surge_events_active_idx
  on public.surge_events(city_slug, vertical) where ended_at is null;
create index if not exists surge_events_started_idx
  on public.surge_events(started_at desc);

alter table public.surge_events enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'surge_events_admin_all'
      and tablename = 'surge_events'
  ) then
    create policy surge_events_admin_all on public.surge_events
      for all to authenticated
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

-- ─── Gap 5: Built-in CMS ────────────────────────────────────────────
create table if not exists public.cms_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(slug) between 1 and 120),
  title text not null check (length(title) between 1 and 200),
  excerpt text,
  body_md text not null default '',
  hero_image_url text,
  author_id uuid references auth.users(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','published','archived')),
  published_at timestamptz,
  audience text[] not null default '{}',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cms_posts_status_idx on public.cms_posts(status);

create or replace function public.cms_posts_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'cms_posts_touch_trg'
  ) then
    create trigger cms_posts_touch_trg
      before update on public.cms_posts
      for each row execute function public.cms_posts_touch();
  end if;
end $$;

alter table public.cms_posts enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'cms_posts_public_select_published'
      and tablename = 'cms_posts'
  ) then
    create policy cms_posts_public_select_published on public.cms_posts
      for select to anon, authenticated
      using (
        status = 'published'
        or exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'cms_posts_admin_write'
      and tablename = 'cms_posts'
  ) then
    create policy cms_posts_admin_write on public.cms_posts
      for all to authenticated
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

create table if not exists public.cms_faqs (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  question text not null check (length(question) between 1 and 300),
  answer_md text not null default '',
  sort_order int not null default 0,
  audience text[] not null default '{}',
  status text not null default 'published'
    check (status in ('draft','published','archived')),
  updated_at timestamptz not null default now()
);
create index if not exists cms_faqs_category_idx
  on public.cms_faqs(category, sort_order);

create or replace function public.cms_faqs_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'cms_faqs_touch_trg'
  ) then
    create trigger cms_faqs_touch_trg
      before update on public.cms_faqs
      for each row execute function public.cms_faqs_touch();
  end if;
end $$;

alter table public.cms_faqs enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'cms_faqs_public_select'
      and tablename = 'cms_faqs'
  ) then
    create policy cms_faqs_public_select on public.cms_faqs
      for select to anon, authenticated
      using (
        status = 'published'
        or exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'cms_faqs_admin_write'
      and tablename = 'cms_faqs'
  ) then
    create policy cms_faqs_admin_write on public.cms_faqs
      for all to authenticated
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

create table if not exists public.cms_banners (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (length(key) between 1 and 80),
  title text not null,
  body text,
  cta_label text,
  cta_href text,
  audience text[] not null default '{}',
  placement text not null
    check (placement in
      ('home_top','dashboard_top','app_home','mobile_modal')),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  dismissible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cms_banners_placement_idx
  on public.cms_banners(placement, active);

create or replace function public.cms_banners_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'cms_banners_touch_trg'
  ) then
    create trigger cms_banners_touch_trg
      before update on public.cms_banners
      for each row execute function public.cms_banners_touch();
  end if;
end $$;

alter table public.cms_banners enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'cms_banners_public_select'
      and tablename = 'cms_banners'
  ) then
    create policy cms_banners_public_select on public.cms_banners
      for select to anon, authenticated
      using (true);
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'cms_banners_admin_write'
      and tablename = 'cms_banners'
  ) then
    create policy cms_banners_admin_write on public.cms_banners
      for all to authenticated
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

-- ─── Gap 6: Compliance documents + alerts view ─────────────────────
create table if not exists public.compliance_documents (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null check (doc_type in
    ('dbs','right_to_work','insurance','first_aid_cert',
     'safeguarding_cert','driver_license','covid_vaccination')),
  status text not null default 'pending'
    check (status in ('pending','verified','expired','rejected')),
  file_url text,
  issued_at date,
  expires_at date,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists compliance_documents_carer_idx
  on public.compliance_documents(caregiver_id);
create index if not exists compliance_documents_expires_idx
  on public.compliance_documents(expires_at);
create index if not exists compliance_documents_status_idx
  on public.compliance_documents(status);

create or replace function public.compliance_documents_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'compliance_documents_touch_trg'
  ) then
    create trigger compliance_documents_touch_trg
      before update on public.compliance_documents
      for each row execute function public.compliance_documents_touch();
  end if;
end $$;

alter table public.compliance_documents enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'compliance_documents_owner_or_admin_select'
      and tablename = 'compliance_documents'
  ) then
    create policy compliance_documents_owner_or_admin_select
      on public.compliance_documents
      for select to authenticated
      using (
        caregiver_id = (select auth.uid())
        or exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'compliance_documents_admin_write'
      and tablename = 'compliance_documents'
  ) then
    create policy compliance_documents_admin_write
      on public.compliance_documents
      for all to authenticated
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

create or replace view public.compliance_alerts_view as
  select
    cd.id as document_id,
    cd.caregiver_id,
    p.full_name,
    u.email,
    cd.doc_type,
    cd.status,
    cd.expires_at,
    case
      when cd.expires_at is null then null
      else (cd.expires_at - current_date)
    end as days_to_expiry
  from public.compliance_documents cd
  left join public.profiles p on p.id = cd.caregiver_id
  left join auth.users u on u.id = cd.caregiver_id
  where cd.status = 'expired'
     or (cd.expires_at is not null
         and cd.expires_at <= current_date + interval '30 days');
grant select on public.compliance_alerts_view to authenticated;

-- ─── Gap 7: Finance enhancements ────────────────────────────────────
-- New `payouts` table (period-bucketed) — distinct from the existing
-- payout_intents (per-request). Both coexist; the marketing /
-- product layer uses payout_intents, ops uses payouts.
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gross numeric(12,2) not null default 0,
  fees numeric(12,2) not null default 0,
  net numeric(12,2) not null default 0,
  status text not null default 'pending'
    check (status in ('pending','processing','paid','failed','on_hold')),
  stripe_payout_id text,
  scheduled_for timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
-- Allow a row to be added later if columns are missing on a pre-existing
-- payouts table (defensive — current migration creates it from scratch).
do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payouts'
  ) then
    alter table public.payouts
      add column if not exists scheduled_for timestamptz;
    alter table public.payouts
      add column if not exists stripe_payout_id text;
  end if;
end $$;
create index if not exists payouts_carer_period_idx
  on public.payouts(caregiver_id, period_start desc);
create index if not exists payouts_status_idx on public.payouts(status);

alter table public.payouts enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'payouts_owner_or_admin_select'
      and tablename = 'payouts'
  ) then
    create policy payouts_owner_or_admin_select on public.payouts
      for select to authenticated
      using (
        caregiver_id = (select auth.uid())
        or exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'payouts_admin_write'
      and tablename = 'payouts'
  ) then
    create policy payouts_admin_write on public.payouts
      for all to authenticated
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

create table if not exists public.fraud_signals (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in
    ('user','booking','caregiver')),
  subject_id uuid not null,
  signal_type text not null check (signal_type in
    ('velocity','card_mismatch','multi_account',
     'geo_mismatch','chargeback','unusual_pattern')),
  severity int not null check (severity between 1 and 5),
  details jsonb not null default '{}',
  status text not null default 'new'
    check (status in ('new','reviewing','cleared','confirmed')),
  flagged_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz
);
create index if not exists fraud_signals_status_idx
  on public.fraud_signals(status);
create index if not exists fraud_signals_subject_idx
  on public.fraud_signals(subject_type, subject_id);

alter table public.fraud_signals enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'fraud_signals_admin_all'
      and tablename = 'fraud_signals'
  ) then
    create policy fraud_signals_admin_all on public.fraud_signals
      for all to authenticated
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

create table if not exists public.tax_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null check (doc_type in
    ('1099','p60','p11d','self_assessment_summary')),
  tax_year int not null check (tax_year between 2020 and 2099),
  file_url text,
  generated_at timestamptz,
  sent_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','ready','sent','amended'))
);
create index if not exists tax_documents_user_idx
  on public.tax_documents(user_id, tax_year);
create index if not exists tax_documents_status_idx
  on public.tax_documents(status);

alter table public.tax_documents enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'tax_documents_owner_or_admin_select'
      and tablename = 'tax_documents'
  ) then
    create policy tax_documents_owner_or_admin_select
      on public.tax_documents
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
    where policyname = 'tax_documents_admin_write'
      and tablename = 'tax_documents'
  ) then
    create policy tax_documents_admin_write on public.tax_documents
      for all to authenticated
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

-- ─── Gap 8: Analytics KPI rollups ───────────────────────────────────
create table if not exists public.kpi_rollups_daily (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  metric text not null check (metric in
    ('bookings','gmv','nps','repeat_rate','fill_rate','time_to_match_min')),
  dimension jsonb not null default '{}',
  -- Composite uniqueness via the md5 of the dimension as a deterministic
  -- text fingerprint. Keeps one row per (day, metric, dimension) shape.
  dimension_hash text not null
    generated always as (md5(dimension::text)) stored,
  value numeric(14,4) not null default 0,
  computed_at timestamptz not null default now(),
  unique (day, metric, dimension_hash)
);
create index if not exists kpi_rollups_daily_metric_day_idx
  on public.kpi_rollups_daily(metric, day desc);

alter table public.kpi_rollups_daily enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'kpi_rollups_admin_select'
      and tablename = 'kpi_rollups_daily'
  ) then
    create policy kpi_rollups_admin_select on public.kpi_rollups_daily
      for select to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- ── Seed ────────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════════

-- ─── Gap 3 demo snapshots: 6 rows across London/NYC/Manchester. ─────
insert into public.marketplace_demand_snapshots
  (taken_at, city_slug, vertical, demand_score, supply_score,
   fill_rate, hour_of_day)
select v.* from (values
  (now() - interval '1 hour', 'london-uk', 'elderly_care',
    24.0, 12.0, 0.55, extract(hour from now() - interval '1 hour')::int),
  (now() - interval '2 hour', 'london-uk', 'childcare',
    18.0, 16.0, 0.78, extract(hour from now() - interval '2 hour')::int),
  (now() - interval '1 hour', 'new-york-us', 'elderly_care',
    22.0, 9.0, 0.51, extract(hour from now() - interval '1 hour')::int),
  (now() - interval '1 hour', 'new-york-us', 'special_needs',
    8.0, 10.0, 0.85, extract(hour from now() - interval '1 hour')::int),
  (now() - interval '3 hour', 'manchester-uk', 'postnatal',
    6.0, 5.0, 0.72, extract(hour from now() - interval '3 hour')::int),
  (now() - interval '1 hour', 'manchester-uk', 'complex_care',
    11.0, 4.0, 0.45, extract(hour from now() - interval '1 hour')::int)
) as v(taken_at, city_slug, vertical, demand_score, supply_score,
       fill_rate, hour_of_day)
where not exists (
  select 1 from public.marketplace_demand_snapshots
);

-- ─── Gap 5 sample CMS content ──────────────────────────────────────
insert into public.cms_posts
  (slug, title, excerpt, body_md, status, published_at, audience, tags)
values (
  'welcome-to-specialcarer-3-12',
  'Welcome to SpecialCarer 3.12',
  'A round-up of new ops tooling: re-verification, marketplace heatmap, native ticketing, CMS, compliance, finance and KPI rollups.',
  '# Welcome\n\nThis release ships eight admin-ops gaps as one feature pack. You can read the full notes in the build log.',
  'published', now(), array['UK','US','families','carers'],
  array['release','admin']
)
on conflict (slug) do nothing;

insert into public.cms_faqs
  (category, question, answer_md, sort_order, audience, status)
values
  ('Getting started',
    'How do I book a carer?',
    'Search by city or postcode, pick a verified carer, and book online. Payment is held in escrow until the shift is complete.',
    10, array['families','UK','US'], 'published'),
  ('Safety',
    'Are carers background checked?',
    'Yes — UK carers complete an Enhanced DBS check; US carers complete a Checkr-equivalent screening before any booking.',
    20, array['families','UK','US'], 'published'),
  ('Carers',
    'How does the application pipeline work?',
    'After you apply we screen your details, schedule an interview, run a background check, and onboard you through training before activation.',
    30, array['carers','UK','US'], 'published')
on conflict do nothing;

-- One sample home_top banner — disabled by default (active=false) so a
-- fresh seed doesn't change the production homepage.
insert into public.cms_banners
  (key, title, body, cta_label, cta_href, audience, placement,
   active, dismissible)
values (
  'home-top-3-12-launch',
  'New in SpecialCarer 3.12',
  'Marketplace ops dashboard, native ticketing, and built-in CMS are live.',
  'Read more', '/blog/welcome-to-specialcarer-3-12',
  array['UK','US','family','carer','org','all'], 'home_top',
  false, true
)
on conflict (key) do nothing;

-- ─── Gap 8: 14 days × 6 metrics × 1 dimension key (national rollup). ─
-- We seed deterministic, plausible values so the dashboard isn't
-- empty when an admin first visits.
do $$
declare
  d date;
  m text;
  v numeric;
  bookings_base numeric := 320;
  gmv_base numeric := 14_500.00;
begin
  if (select count(*) from public.kpi_rollups_daily) > 0 then
    return; -- idempotent — don't re-seed.
  end if;
  for i in 0..13 loop
    d := current_date - i;
    foreach m in array array[
      'bookings','gmv','nps','repeat_rate','fill_rate','time_to_match_min'
    ] loop
      v := case m
        when 'bookings' then bookings_base + ((13 - i) * 7) + (i % 3) * 4
        when 'gmv' then gmv_base + ((13 - i) * 320.0) + (i % 5) * 75.0
        when 'nps' then 48 + (i % 4)::numeric
        when 'repeat_rate' then 0.34 + ((i % 5) * 0.01)
        when 'fill_rate' then 0.78 + ((i % 4) * 0.015)
        when 'time_to_match_min' then 18 - (i % 3)::numeric
      end;
      insert into public.kpi_rollups_daily (day, metric, dimension, value)
        values (d, m, '{"scope":"national"}'::jsonb, v)
        on conflict (day, metric, dimension_hash) do nothing;
    end loop;
  end loop;
end $$;
