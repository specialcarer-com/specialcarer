-- ============================================================================
-- SpecialCarer — Phase B: Org booking flow, service users, long-form shifts,
--                         Stripe Invoicing.
-- Idempotent. RLS guards use pg_policies.policyname (not polname).
--
-- Sleep-in economics (intentional, higher platform margin on sleep portion):
--   sleep_in_org_charge  — default 100.00  (what org is invoiced, overnight)
--   sleep_in_carer_pay   — default  50.00  (what carer earns, overnight)
--   Platform retains £50 per duty (50% of org charge, sleep portion only).
--   Active hours still use the normal 75/25 split.
--
--   Carer earnings (sleep_in mode):
--     (active_hours × hourly_rate × 0.75) + sleep_in_carer_pay
--   Org invoice total (sleep_in mode):
--     (active_hours × hourly_rate) + sleep_in_org_charge
--
-- Both fields are org-overridable per booking.  UI guards warn when
-- carer_pay > org_charge or org_charge < carer_pay × 1.5.
-- ============================================================================

-- ── 1. shift_mode type ────────────────────────────────────────────────────────
-- 'single'       — existing default (hourly, up to ~8h)
-- 'twelve_hour'  — up to 12 contiguous hours, single rate
-- 'sleep_in'     — active hours @ full rate + fixed sleep allowance (split economics above)
-- 'recurring_4w' — parent spawns 28 child instances over 4 weeks
do $$ begin
  if not exists (select 1 from pg_type where typname = 'shift_mode') then
    create type public.shift_mode as enum (
      'single',
      'twelve_hour',
      'sleep_in',
      'recurring_4w'
    );
  end if;
end $$;

-- ── 2. Extend bookings for org + long-form shift support ──────────────────────
-- All columns nullable/defaulted so existing seeker rows are unaffected.

-- Org provenance
alter table public.bookings
  add column if not exists organization_id          uuid
    references public.organizations(id) on delete set null,
  add column if not exists service_user_id          uuid,
  -- service_user_id FK added after service_users table exists (step 4)
  add column if not exists booker_member_id         uuid,
  add column if not exists booker_name_snapshot     text,
  add column if not exists booker_role_snapshot     text,
  add column if not exists preferred_carer_id       uuid
    references auth.users(id) on delete set null;

-- Shift mode (default 'single' keeps all existing bookings unchanged)
alter table public.bookings
  add column if not exists shift_mode               public.shift_mode
    not null default 'single';

-- sleep_in fields — TWO separate amounts (different economic treatment):
--
--   sleep_in_org_charge  What the organisation is invoiced for the sleeping
--                        portion.  Default £100.  Appears as a separate line
--                        item on the Stripe invoice:
--                        "Sleep-in allowance: £100"
--
--   sleep_in_carer_pay   What the carer earns for the sleeping portion.
--                        Default £50.  Platform retains the difference (£50).
--                        This 50 % platform margin on the sleep allowance is
--                        intentional — sleep-in shifts carry higher compliance,
--                        on-call escalation and insurance overhead.
--
-- Active hours still use the standard 75/25 split (no change).
alter table public.bookings
  add column if not exists active_hours_start       time,
  add column if not exists active_hours_end         time,
  add column if not exists sleep_in_org_charge      numeric(10,2) not null default 100.00,
  add column if not exists sleep_in_carer_pay       numeric(10,2) not null default 50.00;

comment on column public.bookings.sleep_in_org_charge is
  'Amount invoiced to the org for the sleeping-hours portion of a sleep_in shift. '
  'Default £100. Platform retains (sleep_in_org_charge − sleep_in_carer_pay). '
  'Org-overridable per booking; UI warns if org_charge < carer_pay × 1.5.';

comment on column public.bookings.sleep_in_carer_pay is
  'Flat amount paid to the carer for the sleeping-hours portion of a sleep_in shift. '
  'Default £50. Active hours are still paid at hourly_rate × 0.75. '
  'Org-overridable per booking; UI warns if carer_pay > org_charge.';

-- recurring_4w parent/child relationship
alter table public.bookings
  add column if not exists parent_booking_id        uuid
    references public.bookings(id) on delete restrict,
  add column if not exists recurrence_index         integer,
  add column if not exists is_recurring_parent      boolean not null default false;

-- Offer lifecycle
alter table public.bookings
  add column if not exists offer_expires_at         timestamptz,
  add column if not exists offered_at               timestamptz,
  add column if not exists accepted_at              timestamptz,
  add column if not exists invoiced_at              timestamptz;

-- Matching criteria
alter table public.bookings
  add column if not exists required_categories      text[] not null default '{}',
  add column if not exists required_skills          text[] not null default '{}';

-- Booking source
alter table public.bookings
  add column if not exists booking_source           text not null default 'seeker'
    check (booking_source in ('seeker', 'org'));

-- Stripe invoice reference
alter table public.bookings
  add column if not exists stripe_invoice_id        text;

-- Indexes
create index if not exists bookings_org_idx
  on public.bookings(organization_id) where organization_id is not null;
create index if not exists bookings_service_user_idx
  on public.bookings(service_user_id) where service_user_id is not null;
create index if not exists bookings_parent_idx
  on public.bookings(parent_booking_id) where parent_booking_id is not null;

-- ── 3. Extend booking_status enum with org-specific values ───────────────────
-- ALTER TYPE … ADD VALUE cannot run inside a transaction block; use DO.
do $$ begin
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.booking_status'::regtype
      and enumlabel = 'pending_offer'
  ) then
    alter type public.booking_status add value 'pending_offer';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.booking_status'::regtype
      and enumlabel = 'offered'
  ) then
    alter type public.booking_status add value 'offered';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.booking_status'::regtype
      and enumlabel = 'invoiced'
  ) then
    alter type public.booking_status add value 'invoiced';
  end if;
end $$;

-- ── 4. service_users ─────────────────────────────────────────────────────────
-- Org-scoped register of people care is being arranged for.
-- Soft-delete only (set archived_at; hard deletes are prohibited by RLS).
create table if not exists public.service_users (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null
    references public.organizations(id) on delete restrict,
  full_name             text not null,
  dob                   date,
  gender                text,
  address_line1         text,
  address_line2         text,
  city                  text,
  postcode              text,
  care_categories       text[] not null default '{}',
  care_needs            text,
  safety_notes          text,
  primary_contact_name  text,
  primary_contact_phone text,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id) on delete set null
);

create index if not exists service_users_org_active_idx
  on public.service_users(organization_id, created_at desc)
  where archived_at is null;

alter table public.service_users enable row level security;

drop trigger if exists set_service_users_updated_at on public.service_users;
create trigger set_service_users_updated_at
  before update on public.service_users
  for each row execute function public.set_updated_at();

-- FK from bookings.service_user_id → service_users.id
do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'bookings_service_user_id_fk'
      and table_name = 'bookings'
  ) then
    alter table public.bookings
      add constraint bookings_service_user_id_fk
      foreign key (service_user_id)
      references public.service_users(id)
      on delete set null;
  end if;
end $$;

-- ── 5. RLS — service_users ────────────────────────────────────────────────────
-- Org members can CRUD their own org's service users.
-- Admins can read everything.  Carers see only service_users_anon_v (step 6).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'service_users_org_member_rw'
      and tablename = 'service_users'
  ) then
    create policy service_users_org_member_rw on public.service_users
      for all to authenticated
      using (
        organization_id in (
          select organization_id from public.organization_members
          where user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles
          where id = (select auth.uid()) and role = 'admin'
        )
      )
      with check (
        organization_id in (
          select organization_id from public.organization_members
          where user_id = (select auth.uid())
        )
      );
  end if;
end $$;

-- ── 6. service_users_anon_v — anonymised view for carer-side screens ──────────
-- Exposed only when a carer is assigned to a booking for that service user.
-- API routes must join through bookings (RLS-protected) before querying this
-- view — never select from it directly without a booking_id predicate.
--
-- age_band:        e.g. "70-79"  (decade bucket; null DOB → "Unknown")
-- postcode_prefix: first space-delimited token (UK outward code, e.g. "SW1A")
create or replace view public.service_users_anon_v
  with (security_invoker = true)
as
  select
    su.id,
    su.organization_id,
    case
      when su.dob is null then 'Unknown'
      else (
           (floor(date_part('year', age(su.dob)) / 10) * 10)::int::text
        || '-'
        || ((floor(date_part('year', age(su.dob)) / 10) * 10 + 9)::int::text)
      )
    end                                               as age_band,
    split_part(coalesce(su.postcode, ''), ' ', 1)    as postcode_prefix,
    su.care_categories,
    su.care_needs,
    su.safety_notes
  from public.service_users su
  where su.archived_at is null;

-- Authenticated users (including carers) can query the view; row-level
-- protection is enforced by the service_users table's RLS policy via
-- security_invoker = true.  Carer-facing API routes additionally filter
-- on booking.service_user_id to prevent lateral reads.
grant select on public.service_users_anon_v to authenticated;

-- ── 7. org_booking_offers — offer distribution tracking ──────────────────────
-- Records which carers were sent an offer for each org booking and outcome.
create table if not exists public.org_booking_offers (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id) on delete cascade,
  carer_id      uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'pending'
    check (status in ('pending','accepted','declined','expired','cancelled')),
  offered_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '24 hours'),
  responded_at  timestamptz,
  unique (booking_id, carer_id)
);

create index if not exists org_booking_offers_booking_idx
  on public.org_booking_offers(booking_id);
create index if not exists org_booking_offers_carer_idx
  on public.org_booking_offers(carer_id);
create index if not exists org_booking_offers_expiry_idx
  on public.org_booking_offers(expires_at) where status = 'pending';

alter table public.org_booking_offers enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'org_booking_offers_read'
      and tablename = 'org_booking_offers'
  ) then
    create policy org_booking_offers_read on public.org_booking_offers
      for select to authenticated
      using (
        -- org member can see offers on their bookings
        booking_id in (
          select b.id from public.bookings b
          join public.organization_members om
            on om.organization_id = b.organization_id
          where om.user_id = (select auth.uid())
        )
        -- carer sees their own offers
        or carer_id = (select auth.uid())
        -- admin
        or exists (
          select 1 from public.profiles
          where id = (select auth.uid()) and role = 'admin'
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'org_booking_offers_carer_respond'
      and tablename = 'org_booking_offers'
  ) then
    create policy org_booking_offers_carer_respond on public.org_booking_offers
      for update to authenticated
      using  (carer_id = (select auth.uid()))
      with check (carer_id = (select auth.uid()));
  end if;
end $$;

-- ── 8. org_booking_cancellations — cancellation policy + fee audit ────────────
--
-- Timing buckets and fee policy:
--   free    — cancelled ≥ 24h before start  → no charge, no carer payout
--   partial — cancelled ≥ 2h but < 24h      → 50 % of shift fee charged to org,
--                                              100 % paid to carer
--   full    — cancelled < 2h or no-show      → 100 % of shift fee charged to org,
--                                              100 % paid to carer
create table if not exists public.org_booking_cancellations (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null unique
    references public.bookings(id) on delete cascade,
  cancelled_by        uuid not null references auth.users(id),
  reason              text,
  timing_bucket       text not null
    check (timing_bucket in ('free','partial','full')),
  hours_before_start  numeric(8,2),
  fee_charged_cents   integer not null default 0,
  carer_payout_cents  integer not null default 0,
  stripe_invoice_id   text,
  cancelled_at        timestamptz not null default now()
);

create index if not exists org_booking_cancellations_booking_idx
  on public.org_booking_cancellations(booking_id);

alter table public.org_booking_cancellations enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'org_booking_cancellations_read'
      and tablename = 'org_booking_cancellations'
  ) then
    create policy org_booking_cancellations_read on public.org_booking_cancellations
      for select to authenticated
      using (
        booking_id in (
          select b.id from public.bookings b
          join public.organization_members om
            on om.organization_id = b.organization_id
          where om.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles
          where id = (select auth.uid()) and role = 'admin'
        )
      );
  end if;
end $$;

-- ── 9. organization_billing — add net_terms_days ─────────────────────────────
-- stripe_customer_id was already added in Phase A; add if somehow missing.
alter table public.organization_billing
  add column if not exists net_terms_days  integer not null default 14
    check (net_terms_days in (7, 14, 30)),
  add column if not exists stripe_customer_id text;

comment on column public.organization_billing.net_terms_days is
  'Days until Stripe invoice is due. Maps to Stripe collection_method=send_invoice '
  'with days_until_due. Admin-only edit. Defaults to 14 (net-14).';

-- ── 10. org_invoices — local mirror of Stripe invoices ───────────────────────
create table if not exists public.org_invoices (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null
    references public.organizations(id) on delete restrict,
  booking_id          uuid
    references public.bookings(id) on delete set null,
  stripe_invoice_id   text not null unique,
  stripe_customer_id  text not null,
  status              text not null default 'draft'
    check (status in ('draft','open','paid','void','uncollectible')),
  amount_due_cents    integer not null default 0,
  amount_paid_cents   integer not null default 0,
  currency            text not null default 'gbp',
  due_date            date,
  hosted_invoice_url  text,
  invoice_pdf_url     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists org_invoices_org_idx
  on public.org_invoices(organization_id, created_at desc);
create index if not exists org_invoices_booking_idx
  on public.org_invoices(booking_id) where booking_id is not null;
create index if not exists org_invoices_stripe_idx
  on public.org_invoices(stripe_invoice_id);

alter table public.org_invoices enable row level security;

drop trigger if exists set_org_invoices_updated_at on public.org_invoices;
create trigger set_org_invoices_updated_at
  before update on public.org_invoices
  for each row execute function public.set_updated_at();

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'org_invoices_member_read'
      and tablename = 'org_invoices'
  ) then
    create policy org_invoices_member_read on public.org_invoices
      for select to authenticated
      using (
        organization_id in (
          select organization_id from public.organization_members
          where user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles
          where id = (select auth.uid()) and role = 'admin'
        )
      );
  end if;
end $$;

-- ── 11. RLS: org members can read their bookings ──────────────────────────────
-- The existing "parties can read own bookings" policy covers seeker_id and
-- caregiver_id. This additive policy covers org members + admins.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'bookings_org_member_read'
      and tablename = 'bookings'
  ) then
    create policy bookings_org_member_read on public.bookings
      for select to authenticated
      using (
        organization_id in (
          select organization_id from public.organization_members
          where user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles
          where id = (select auth.uid()) and role = 'admin'
        )
      );
  end if;
end $$;

-- ── 12. Org billing totals on bookings ────────────────────────────────────────
-- Payment architecture for org bookings (IMPORTANT — differs from B2C):
--
--   B2C path: Stripe Connect destination charge → carer paid by Stripe on capture.
--
--   Org path: All Care 4 U Group Ltd issues a Stripe Invoice to the org.
--             Org pays All Care 4 U Group Ltd directly (no Connect split).
--             Carer is paid by All Care 4 U Group Ltd from its OWN funds via
--             the existing weekly payout cycle — independently of invoice status.
--
-- Working-capital implication: All Care 4 U Group Ltd FRONTS the carer payment
-- when the shift is marked completed, typically before the org's net-14 invoice
-- clears. This is intentional at MVP — carer is always paid on schedule.
--
-- TODO (Phase C): implement an org credit-risk flag that pauses new booking
-- creation (not carer payouts) for orgs with overdue invoices. For MVP, always
-- pay the carer on time regardless of org payment status.
--
-- org_charge_total_cents : total invoiced to the org (what they pay us).
--   Shown on org dashboard + Stripe invoice line items.
--   sleep_in:    (hours × hourly_rate_cents) + ROUND(sleep_in_org_charge × 100)
--   other modes: equal to subtotal_cents
--
-- carer_pay_total_cents  : total owed to the carer. NEVER shown to the org.
--   Visible to: carer (their earnings screen) + admin (/admin/org-bookings only).
--   sleep_in:    ROUND(subtotal_cents × 0.75) + ROUND(sleep_in_carer_pay × 100)
--   other modes: ROUND(subtotal_cents × 0.75)
--
-- Platform margin = org_charge_total_cents − carer_pay_total_cents
--   Active hours : 25% of active subtotal (standard fee)
--   Sleep portion: 50% of sleep_in_org_charge (intentional higher margin —
--                  sleep-in shifts have greater compliance/insurance overhead)

alter table public.bookings
  add column if not exists org_charge_total_cents  integer,
  add column if not exists carer_pay_total_cents   integer;

comment on column public.bookings.org_charge_total_cents is
  'Total invoiced to the org (pence). For sleep_in: '
  '(hours × hourly_rate_cents) + ROUND(sleep_in_org_charge × 100). '
  'For other modes: subtotal_cents. '
  'Do NOT expose carer_pay_total_cents to the org.';

comment on column public.bookings.carer_pay_total_cents is
  'Total earned by the carer (pence). For sleep_in: '
  'ROUND(subtotal_cents × 0.75) + ROUND(sleep_in_carer_pay × 100). '
  'For other modes: ROUND(subtotal_cents × 0.75). '
  'Accrued on shift completion; paid via weekly payout cycle from '
  'All Care 4 U Group Ltd funds (NOT from org invoice payment). '
  'NEVER shown to the org.';

-- Index to support the payout cycle query for org shifts
create index if not exists bookings_org_carer_payout_idx
  on public.bookings(caregiver_id, shift_completed_at)
  where booking_source = 'org'
    and status in ('completed','invoiced')
    and paid_out_at is null;

-- ── 13. Update bookings_near_carer RPC for org offer visibility ────────────────
-- Replaces the v1 RPC to also surface:
--   • status = 'offered' (org shift offers sent to this carer)
--   • shift_mode, sleep_in_carer_pay (needed by carer job cards + active screen)
--
create or replace function public.bookings_near_carer(
  carer_uuid uuid,
  radius_m double precision default 50000
)
returns table (
  id                  uuid,
  seeker_id           uuid,
  status              text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  hours               numeric,
  hourly_rate_cents   int,
  currency            text,
  service_type        text,
  location_city       text,
  location_country    text,
  location_postcode   text,
  service_point_lng   double precision,
  service_point_lat   double precision,
  distance_m          double precision,
  discovery_expires_at timestamptz,
  created_at          timestamptz,
  shift_mode          text,
  sleep_in_carer_pay  numeric,
  booking_source      text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with carer_home as (
    select home_point::extensions.geography as g
    from public.caregiver_profiles
    where user_id = carer_uuid
    limit 1
  )
  select
    b.id,
    b.seeker_id,
    b.status::text,
    b.starts_at,
    b.ends_at,
    b.hours,
    b.hourly_rate_cents,
    b.currency,
    b.service_type::text,
    b.location_city,
    b.location_country,
    b.location_postcode,
    case when b.service_point is not null
      then extensions.st_x(b.service_point::extensions.geometry)
      else null
    end as service_point_lng,
    case when b.service_point is not null
      then extensions.st_y(b.service_point::extensions.geometry)
      else null
    end as service_point_lat,
    case
      when b.service_point is null or (select g from carer_home) is null
        then null
      else extensions.st_distance(
        b.service_point::extensions.geography,
        (select g from carer_home)
      )
    end as distance_m,
    b.discovery_expires_at,
    b.created_at,
    b.shift_mode::text,
    b.sleep_in_carer_pay,
    b.booking_source::text
  from public.bookings b
  where b.caregiver_id = carer_uuid
    -- Include regular bookings + org offers
    and b.status in ('pending', 'accepted', 'paid', 'offered')
    and b.starts_at >= now()
    and (
      b.service_point is null
      or (select g from carer_home) is null
      or extensions.st_dwithin(
        b.service_point::extensions.geography,
        (select g from carer_home),
        radius_m
      )
    )
  order by b.starts_at asc;
$$;

grant execute on function public.bookings_near_carer(uuid, double precision)
  to authenticated;
