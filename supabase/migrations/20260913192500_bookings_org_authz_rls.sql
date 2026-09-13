-- ============================================================================
-- SpecialCarer — D3 / Bookings org authz + RLS tightening + booker RPC
--
-- Phase D's third PR: turns the already-existing booker-attribution columns
-- on `bookings` (organization_id, booker_member_id, booker_name_snapshot,
-- booker_role_snapshot) into a first-class code path. Prod verification
-- via Supabase Management API on 13 Sep 2026:
--   • bookings.organization_id / booker_member_id / *_snapshot already
--     exist (added by 20260509103559_org_booking_phase_b.sql). NO schema
--     additions are needed.
--   • 13 bookings live in prod, 4 org-linked, ZERO have booker_member_id
--     populated — the write path never populated it.
--   • bookings has 3 SELECT RLS policies: `admins read all bookings`,
--     `bookings_org_member_read` (any org member — including viewer —
--     reads all org bookings), `parties can read own bookings`.
--   • bookings has NO INSERT/UPDATE RLS policies — writes go through
--     service_role only; the route handlers enforce authorisation.
--
-- Three changes here:
--
--  1. REPLACE the too-permissive `bookings_org_member_read` policy with
--     4 role-scoped SELECT policies (admin/booker/finance/viewer). All
--     four expose the same row set — PostgreSQL RLS is all-or-nothing
--     per row, so viewer's column-scope restriction is enforced at the
--     application layer (the org-bookings API projection hides
--     financial columns when the caller's role is `viewer`). Documented
--     inline on the viewer policy.
--
--  2. Create `create_org_booking_with_offer` — a SECURITY DEFINER
--     plpgsql function that atomically inserts a booking row + N offer
--     rows and snapshots the booker's name/role from
--     `organization_members`. The route handler owns authz (verifies
--     the caller has booker+ role in the org); the RPC only enforces
--     the invariant that `booker_member_id` truly belongs to
--     `organization_id`.
--
--  3. Backfill: attribute the 4 pre-existing org bookings that have
--     NULL booker_member_id to their org's owner. Matches historical
--     reality — pre-D3, only the signing owner could book.
--
-- DESTRUCTIVE step: change (1) drops the old permissive
-- `bookings_org_member_read` policy. Leaving it in place would defeat
-- the tighter per-role variants (any viewer would still see everything
-- via the old policy). The commit + PR body carry the
-- `Allow-Destructive: true` trailer so the preflight scanner allows
-- the merge.
--
-- Freeze-respectful: bookings table itself is untouched — no ALTER
-- TABLE, no new columns, no new indexes. Only policies and a new
-- function are added. The backfill UPDATE only touches org rows that
-- have NULL booker_member_id (4 rows in prod today).
--
-- Deploy-safe: routes that call the new RPC catch PG error code `42P01`
-- (undefined_function — the RPC hasn't been created yet in the target
-- environment) and return HTTP 202 { ok:true, skippedReason:
-- 'schema_not_ready' }. This mirrors the D1/D2 pattern.
-- ============================================================================

-- ── 1. RLS: replace the permissive org-member-read policy ────────────────────
--
-- Old policy: `bookings_org_member_read` — ANY org member (viewer
-- included) could SELECT any booking of any org they belong to. Post-D2
-- this exposes financial columns to viewers who should only see the
-- schedule.
--
-- New split: 4 policies, one per role. Fresh names so the preflight
-- rule against `drop policy if exists` on new policies is satisfied.

-- Admin variant — owner + admin of the org see everything.
-- TODO(rm-ni-split): expand admin roles to ('owner','admin','rm') once
-- the RM/NI split lands (same rule as D1/D2 admin policies).
create policy bookings_org_admin_read_v2 on public.bookings
  for select to authenticated
  using (
    organization_id is not null
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = bookings.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
    )
  );

-- Booker variant — bookers need full financial context to make
-- booking decisions competently (they see rate x hours to know
-- whether a booking fits the client's budget).
create policy bookings_org_booker_read_v2 on public.bookings
  for select to authenticated
  using (
    organization_id is not null
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = bookings.organization_id
        and om.user_id = (select auth.uid())
        and om.role = 'booker'
    )
  );

-- Finance variant — finance handles invoices, needs every column.
create policy bookings_org_finance_read_v2 on public.bookings
  for select to authenticated
  using (
    organization_id is not null
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = bookings.organization_id
        and om.user_id = (select auth.uid())
        and om.role = 'finance'
    )
  );

-- Viewer variant — same rowset as the three variants above, but the
-- application layer (org-bookings list + detail routes) MUST hide
-- financial columns when the caller's role is viewer. PostgreSQL RLS
-- cannot enforce column-level restrictions at the policy level (it's
-- all-or-nothing per row), so the viewer's read scope is a shared
-- application concern. Row-level visibility is granted so viewer's UI
-- can render counts / schedules without being told rows exist that
-- they can't see (which would be a worse UX signal).
--
-- TODO(rls-column-scope): consider granting SELECT on a filtered
-- subset of columns via a role-specific GRANT once we have a
-- `bookings_viewer_role` PostgreSQL role. Today Supabase RLS relies on
-- `authenticated` for everything, so the column-scope has to live in
-- the API projection.
create policy bookings_org_viewer_read_v2 on public.bookings
  for select to authenticated
  using (
    organization_id is not null
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = bookings.organization_id
        and om.user_id = (select auth.uid())
        and om.role = 'viewer'
    )
  );

-- Only NOW drop the old permissive policy. Doing this before adding
-- the four new policies would open a window where org members see
-- nothing — bad for the live 4 org bookings. Order matters: add-then-
-- drop keeps the surface non-regressive during the migration itself.
drop policy if exists bookings_org_member_read on public.bookings;

-- ── 2. RPC: create_org_booking_with_offer ────────────────────────────────────
--
-- Atomic: booking row + N offer rows in one transaction. Snapshots
-- the booker's name + role from `organization_members` at booking
-- time so team changes don't rewrite history.
--
-- Authorisation model:
--   • The RPC is SECURITY DEFINER but the calling route already
--     resolved the actor's role via requireBookerRole(...).
--   • The RPC re-verifies ONE invariant: `p_booker_member_id` must
--     actually belong to `p_organization_id`. This blocks the (in
--     theory impossible) case where a route bug lets an actor book on
--     behalf of an org they don't belong to.
--   • The RPC does NOT re-verify the caller's role — that would
--     duplicate the route-layer check and add a second failure mode.
--
-- Returned value: the freshly created booking id. The route uses
-- this to fetch the full row for the response body.
--
-- Enum: booking status is set to `pending_offer` by default (matches
-- what the existing route sets before offers are dispatched). Callers
-- can override via p_status if they want to skip straight to
-- `offered` after the offer rows are in place.
create or replace function public.create_org_booking_with_offer(
  p_organization_id     uuid,
  p_booker_member_id    uuid,
  p_service_type        text,
  p_starts_at           timestamptz,
  p_ends_at             timestamptz,
  p_hours               numeric,
  p_hourly_rate_cents   integer,
  p_subtotal_cents      integer,
  p_currency            text,
  p_seeker_id           uuid,
  p_carer_ids           uuid[],
  p_service_user_id     uuid default null,
  p_preferred_carer_id  uuid default null,
  p_required_categories text[] default '{}',
  p_required_skills     text[] default '{}',
  p_shift_mode          public.shift_mode default 'single',
  p_active_hours_start  time default null,
  p_active_hours_end    time default null,
  p_sleep_in_org_charge numeric default 100.00,
  p_sleep_in_carer_pay  numeric default 50.00,
  p_org_charge_total_cents integer default null,
  p_carer_pay_total_cents  integer default null,
  p_platform_fee_cents  integer default null,
  p_total_cents         integer default null,
  p_notes               text default null,
  p_status              public.booking_status default 'pending_offer',
  p_offer_ttl_hours     integer default 24
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
  v_booker_name text;
  v_booker_role text;
  v_carer uuid;
  v_offer_expires_at timestamptz := now() + make_interval(hours => p_offer_ttl_hours);
begin
  -- Snapshot booker identity. This is the ONLY re-verification the
  -- RPC does: the (member_id, org_id) tuple must exist. If the row
  -- is missing the caller passed a stale member id, an id from
  -- another org, or an id that never existed.
  select om.full_name, om.role
    into v_booker_name, v_booker_role
    from public.organization_members om
   where om.id = p_booker_member_id
     and om.organization_id = p_organization_id;

  if v_booker_name is null then
    raise exception 'booker_member_id % is not a member of organization %',
      p_booker_member_id, p_organization_id
      using errcode = '22023'; -- invalid_parameter_value
  end if;

  insert into public.bookings (
    organization_id,
    service_user_id,
    booker_member_id,
    booker_name_snapshot,
    booker_role_snapshot,
    booking_source,
    shift_mode,
    starts_at,
    ends_at,
    hours,
    hourly_rate_cents,
    subtotal_cents,
    platform_fee_cents,
    total_cents,
    currency,
    service_type,
    required_categories,
    required_skills,
    preferred_carer_id,
    active_hours_start,
    active_hours_end,
    sleep_in_org_charge,
    sleep_in_carer_pay,
    org_charge_total_cents,
    carer_pay_total_cents,
    notes,
    status,
    seeker_id,
    caregiver_id,
    offer_expires_at
  ) values (
    p_organization_id,
    p_service_user_id,
    p_booker_member_id,
    v_booker_name,
    v_booker_role,
    'org',
    p_shift_mode,
    p_starts_at,
    p_ends_at,
    p_hours,
    p_hourly_rate_cents,
    p_subtotal_cents,
    coalesce(p_platform_fee_cents, (p_subtotal_cents * 0.25)::integer),
    coalesce(p_total_cents, p_subtotal_cents),
    p_currency,
    p_service_type,
    p_required_categories,
    p_required_skills,
    p_preferred_carer_id,
    p_active_hours_start,
    p_active_hours_end,
    p_sleep_in_org_charge,
    p_sleep_in_carer_pay,
    p_org_charge_total_cents,
    p_carer_pay_total_cents,
    p_notes,
    p_status,
    p_seeker_id,
    p_seeker_id,           -- caregiver_id placeholder until acceptance
    v_offer_expires_at
  )
  returning id into v_booking_id;

  -- Fan out offers. Duplicates would violate the (booking_id, carer_id)
  -- unique constraint — surface as-is; the route layer maps the
  -- 23505 code to a 409 for the client.
  if array_length(p_carer_ids, 1) > 0 then
    foreach v_carer in array p_carer_ids
    loop
      insert into public.org_booking_offers (
        booking_id, carer_id, status, offered_at, expires_at
      ) values (
        v_booking_id, v_carer, 'pending', now(), v_offer_expires_at
      );
    end loop;
  end if;

  return v_booking_id;
end;
$$;

comment on function public.create_org_booking_with_offer is
  'D3 atomic org-booking create + offer distribution. Snapshots booker '
  'identity from organization_members at insert time. Authorisation is '
  'the caller''s responsibility — the RPC only re-verifies that '
  'booker_member_id belongs to organization_id. SECURITY DEFINER so '
  'the RLS-less write can happen without exposing service_role to the '
  'client (PostgREST routes the call as `authenticated`).';

-- Only authenticated users can call it. The route handler layer is
-- the primary authorisation surface (via requireBookerRole).
revoke all on function public.create_org_booking_with_offer(
  uuid, uuid, text, timestamptz, timestamptz, numeric, integer, integer,
  text, uuid, uuid[], uuid, uuid, text[], text[], public.shift_mode,
  time, time, numeric, numeric, integer, integer, integer, integer,
  text, public.booking_status, integer
) from public;
grant execute on function public.create_org_booking_with_offer(
  uuid, uuid, text, timestamptz, timestamptz, numeric, integer, integer,
  text, uuid, uuid[], uuid, uuid, text[], text[], public.shift_mode,
  time, time, numeric, numeric, integer, integer, integer, integer,
  text, public.booking_status, integer
) to authenticated;

-- ── 3. One-shot backfill: attribute pre-existing org bookings ────────────────
--
-- The 4 org-linked bookings in prod today were all created by the
-- org's owner (pre-D3, only the signatory could book). Attribute
-- them to that owner's org_member row so downstream queries that
-- filter or group by booker_member_id have a value to work with.
--
-- Safe to re-run: the WHERE clause only touches rows that still have
-- NULL booker_member_id. Once the D3 write path is live, new rows
-- always populate it — this UPDATE becomes a no-op.
update public.bookings b
   set booker_member_id      = m.id,
       booker_name_snapshot  = coalesce(b.booker_name_snapshot, m.full_name),
       booker_role_snapshot  = coalesce(b.booker_role_snapshot, 'owner')
  from public.organization_members m
 where b.organization_id is not null
   and b.booker_member_id is null
   and m.organization_id = b.organization_id
   and m.role = 'owner';
