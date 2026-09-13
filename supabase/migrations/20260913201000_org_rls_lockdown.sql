-- ============================================================================
-- SpecialCarer — D4 / Org RLS lockdown + cross-org leak fixes
--
-- Phase D's fourth PR: closes the five confirmed authorisation gaps
-- across the 11 remaining `public.*` org tables after D3's `bookings`
-- lockdown. Verified via Supabase Management API on 13 Sep 2026 against
-- project qupjaanyhnuvlexkwtpq.
--
-- Read + write matrices, per-table risk notes, and the full audit query
-- results live in /workspace/phase_d/org_rls_matrix.md (attached to the
-- PR description).
--
-- Role hierarchy (D2 recap):
--
--     owner  (rank 4)
--     admin  (rank 3)
--     booker (2)  finance (2)   ← parallel siblings, neither ranks above
--     viewer (1)
--
-- ---------------------------------------------------------------------------
-- What this migration does (five buckets):
--
--   BUCKET A — CRITICAL: strip the two "member_rw" ALL policies that let
--   viewers write to Stripe billing config + org documents.
--     * organization_billing  → split into role-gated SELECT + INSERT + UPDATE
--     * organization_documents → split into role-gated SELECT + INSERT +
--                                UPDATE + DELETE
--
--   BUCKET B — HIGH: strip the two "members_*" free-for-alls on the
--   organizations UPDATE + the org_invoices SELECT.
--     * organizations → drop `organizations_members_update`; add
--                       `organizations_admin_update_v2`
--     * org_invoices  → drop `org_invoices_member_read`; add
--                       `org_invoices_admin_finance_read_v2`
--
--   BUCKET C — MEDIUM (audit inline): the two `*_read` policies on
--   org_booking_offers + org_booking_cancellations are the same
--   permissive shape ("any org member sees any row on any booking of
--   their org"). Verified expression on 13 Sep 2026 — see runbook §4.
--   Replace with role-gated variants (owner/admin/booker read; carer
--   sees their own offer; SC admin reads all).
--
--   BUCKET D — MEDIUM (additive): org_carer_payouts +
--   org_carer_payout_items have no org-side SELECT coverage — carers see
--   their own row, but the org's finance/admin has no policy at all
--   (they can only read via SC-admin escalation). Add
--   `*_admin_finance_read_v2` policies. Existing carer-read policy is
--   kept.
--
--   BUCKET E — LOW (parity): organization_contracts SELECT is already
--   correct (matches the read matrix). Add
--   `organization_contracts_admin_insert_v2` +
--   `organization_contracts_admin_update_v2` for parity with future
--   admin-managed contract edits. No drops.
--
-- Not touched by D4 (see runbook §5):
--   * bookings                 — D3 handled
--   * org_leads                — already SC-admin-only, matches matrix
--   * organization_invitations — D1 correct
--   * org_membership_audit     — D2 correct
--   * organization_members     — existing self+team read policy already
--                                matches the D4 matrix (see runbook §4).
--                                Documented as a NOOP-with-rationale.
--
-- ---------------------------------------------------------------------------
-- DESTRUCTIVE steps (5 total) — one per bucket-A/B/C policy that gets
-- replaced. Preflight destructive-migration gate at PR #220 keys on the
-- regex `DROP[[:space:]]+POLICY`. The tip commit carries the trailer
-- `Allow-Destructive: true` so the auto-apply gate allows the merge.
--
--   DROP POLICY organizations_members_update ON public.organizations;
--   DROP POLICY organization_billing_member_rw ON public.organization_billing;
--   DROP POLICY organization_documents_member_rw ON public.organization_documents;
--   DROP POLICY org_invoices_member_read ON public.org_invoices;
--   DROP POLICY org_booking_offers_read ON public.org_booking_offers;
--   DROP POLICY org_booking_cancellations_read ON public.org_booking_cancellations;
--
-- Note: six drops (not five) — the offers+cancellations pair together
-- makes bucket C. All are explicit `DROP POLICY name ON table;` — never
-- `DROP POLICY IF EXISTS` (per D4 operating rules).
--
-- Ordering per table: CREATE the v2 policies first, THEN drop the
-- predecessor. This preserves read + write access throughout the
-- migration — there's no window where a legitimate member loses access
-- to a row they saw before.
--
-- `TODO(rm-ni-split):` markers flag every admin-set literal that will
-- expand to include the RM + NI roles when the regional-manager split
-- lands. Same marker convention as D1/D2/D3.
--
-- Freeze-respectful: no ALTER TABLE. No new columns, indexes, or
-- functions. Only policy CREATE / DROP.
--
-- Deploy-safe fallbacks: NOT needed. RLS is DB-level, not API-level;
-- the tightened policies take effect the moment the migration runs.
-- Feature flag `NEXT_PUBLIC_ORG_INVITATIONS_ENABLED` is still `false`
-- in Vercel prod, so the D1/D2/D3 API surfaces remain 404 — no consumer
-- of a tightened path is unflagged today. Any regression appears as a
-- 500 in the Vercel logs; D4 will not attempt any API-layer fixes.
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- BUCKET A.1 — organization_billing
-- Old: organization_billing_member_rw (ALL — cmd=`*`)
--      Any member (viewer included) could SELECT or UPDATE Stripe config,
--      including bank account fields. Payout re-routing without audit.
-- New: admin+finance for SELECT, INSERT, UPDATE. No DELETE policy —
--      billing rows persist for the lifetime of the org and are removed
--      only via service_role (org close-down).
-- ═══════════════════════════════════════════════════════════════════════════

create policy organization_billing_admin_finance_read_v2 on public.organization_billing
  for select to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_billing.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin', 'finance')
        -- TODO(rm-ni-split): expand admin set to ('owner','admin','rm','ni','finance')
    )
  );

create policy organization_billing_admin_finance_insert_v2 on public.organization_billing
  for insert to authenticated
  with check (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_billing.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin', 'finance')
        -- TODO(rm-ni-split): expand admin set to ('owner','admin','rm','ni','finance')
    )
  );

create policy organization_billing_admin_finance_update_v2 on public.organization_billing
  for update to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_billing.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin', 'finance')
        -- TODO(rm-ni-split): expand admin set to ('owner','admin','rm','ni','finance')
    )
  )
  with check (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_billing.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin', 'finance')
        -- TODO(rm-ni-split): expand admin set to ('owner','admin','rm','ni','finance')
    )
  );

-- SC platform admin ALL policy — parity with every other org table so
-- SC support can inspect + repair.
create policy organization_billing_sc_admin_all_v2 on public.organization_billing
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
        -- TODO(rm-ni-split): SC-admin profiles.role set may split too.
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );

drop policy organization_billing_member_rw on public.organization_billing;


-- ═══════════════════════════════════════════════════════════════════════════
-- BUCKET A.2 — organization_documents
-- Old: organization_documents_member_rw (ALL — cmd=`*`)
--      Any member (viewer included) could SELECT / INSERT / UPDATE /
--      DELETE any organisation document. Includes RTW proof, DBS
--      certificates, insurance, safeguarding evidence.
-- New: SELECT — owner/admin/finance (finance sees RTW for payroll onboarding)
--      INSERT/UPDATE/DELETE — owner/admin only
-- ═══════════════════════════════════════════════════════════════════════════

create policy organization_documents_admin_finance_read_v2 on public.organization_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_documents.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin', 'finance')
        -- TODO(rm-ni-split): expand admin set.
    )
  );

create policy organization_documents_admin_insert_v2 on public.organization_documents
  for insert to authenticated
  with check (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_documents.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
        -- TODO(rm-ni-split): expand admin set.
    )
  );

create policy organization_documents_admin_update_v2 on public.organization_documents
  for update to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_documents.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
        -- TODO(rm-ni-split): expand admin set.
    )
  )
  with check (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_documents.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
    )
  );

create policy organization_documents_admin_delete_v2 on public.organization_documents
  for delete to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_documents.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
        -- TODO(rm-ni-split): expand admin set.
    )
  );

create policy organization_documents_sc_admin_all_v2 on public.organization_documents
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );

drop policy organization_documents_member_rw on public.organization_documents;


-- ═══════════════════════════════════════════════════════════════════════════
-- BUCKET B.1 — organizations
-- Old: organizations_members_update (UPDATE — cmd=`w`)
--      ANY member could UPDATE the org row (rename, change CQC number,
--      overwrite logo). No role check.
-- New: organizations_admin_update_v2 — owner+admin only.
-- Kept: organizations_members_read (SELECT — matches matrix; all org
--       members read the org they belong to).
-- Kept: organizations_creator_update (UPDATE only when created_by =
--       auth.uid()) — narrow legitimate ownership carve-out.
-- ═══════════════════════════════════════════════════════════════════════════

create policy organizations_admin_update_v2 on public.organizations
  for update to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organizations.id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
        -- TODO(rm-ni-split): expand admin set.
    )
  )
  with check (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organizations.id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
    )
  );

drop policy organizations_members_update on public.organizations;


-- ═══════════════════════════════════════════════════════════════════════════
-- BUCKET B.2 — org_invoices
-- Old: org_invoices_member_read (SELECT — cmd=`r`)
--      Any member (viewer included) sees line-item PII, monthly totals,
--      Stripe invoice URLs. Booker also sees, which is wrong.
-- New: org_invoices_admin_finance_read_v2 — owner+admin+finance only.
-- No INSERT/UPDATE policy — invoices are written by Stripe webhook
-- via service_role.
-- ═══════════════════════════════════════════════════════════════════════════

create policy org_invoices_admin_finance_read_v2 on public.org_invoices
  for select to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = org_invoices.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin', 'finance')
        -- TODO(rm-ni-split): expand admin set.
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );

drop policy org_invoices_member_read on public.org_invoices;


-- ═══════════════════════════════════════════════════════════════════════════
-- BUCKET D.1 — org_carer_payouts (additive)
-- Old: org_carer_payouts_carer_read — carer sees own payout row + SC
--      admin reads all. No org-side visibility at all.
-- New: add org_carer_payouts_admin_finance_read_v2 (SELECT for
--      owner/admin/finance of the org the payout belongs to). Carer
--      read policy KEPT.
-- ═══════════════════════════════════════════════════════════════════════════

create policy org_carer_payouts_admin_finance_read_v2 on public.org_carer_payouts
  for select to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = org_carer_payouts.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin', 'finance')
        -- TODO(rm-ni-split): expand admin set.
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- BUCKET D.2 — org_carer_payout_items (additive)
-- Same shape as payouts. `payout_id` joins back to `org_carer_payouts`
-- which has `organization_id`. We resolve the org via the parent
-- payout row.
-- ═══════════════════════════════════════════════════════════════════════════

create policy org_carer_payout_items_admin_finance_read_v2 on public.org_carer_payout_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.org_carer_payouts p
      join public.organization_members om
        on om.organization_id = p.organization_id
      where p.id = org_carer_payout_items.payout_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin', 'finance')
        -- TODO(rm-ni-split): expand admin set.
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- BUCKET C.1 — org_booking_offers
-- Old: org_booking_offers_read (SELECT — cmd=`r`)
--   Verified expression 13 Sep 2026:
--     booking_id IN (SELECT b.id FROM bookings b
--                    JOIN organization_members om
--                      ON om.organization_id = b.organization_id
--                    WHERE om.user_id = auth.uid())
--     OR carer_id = auth.uid()
--     OR EXISTS (SELECT 1 FROM profiles
--                 WHERE id = auth.uid() AND role='admin')
--   Any org member sees ALL offers on any booking of their org. Viewer
--   sees pending offer flow before booker has finalised placement;
--   finance sees offer flow when they shouldn't own the operational side.
-- New: 4 role-gated variants:
--   * org_booking_offers_admin_read_v2   (owner+admin of the offer's booking's org)
--   * org_booking_offers_booker_read_v2  (booker of the same)
--   * org_booking_offers_carer_read_v2   (carer sees own offer row)
--   * org_booking_offers_sc_admin_read_v2 (SC platform admin sees all)
-- Kept: org_booking_offers_carer_respond (UPDATE own offer — untouched).
-- ═══════════════════════════════════════════════════════════════════════════

create policy org_booking_offers_admin_read_v2 on public.org_booking_offers
  for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      join public.organization_members om
        on om.organization_id = b.organization_id
      where b.id = org_booking_offers.booking_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
        -- TODO(rm-ni-split): expand admin set.
    )
  );

create policy org_booking_offers_booker_read_v2 on public.org_booking_offers
  for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      join public.organization_members om
        on om.organization_id = b.organization_id
      where b.id = org_booking_offers.booking_id
        and om.user_id = (select auth.uid())
        and om.role = 'booker'
    )
  );

create policy org_booking_offers_carer_read_v2 on public.org_booking_offers
  for select to authenticated
  using (carer_id = (select auth.uid()));

create policy org_booking_offers_sc_admin_read_v2 on public.org_booking_offers
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );

drop policy org_booking_offers_read on public.org_booking_offers;


-- ═══════════════════════════════════════════════════════════════════════════
-- BUCKET C.2 — org_booking_cancellations
-- Old: org_booking_cancellations_read (SELECT — cmd=`r`)
--   Verified expression 13 Sep 2026:
--     booking_id IN (SELECT b.id FROM bookings b
--                    JOIN organization_members om
--                      ON om.organization_id = b.organization_id
--                    WHERE om.user_id = auth.uid())
--     OR EXISTS (SELECT 1 FROM profiles
--                 WHERE id = auth.uid() AND role='admin')
--   Same permissive shape as offers. Cancellations are operational data
--   the booker owns; finance has no need to see them.
-- New: 3 role-gated variants (owner+admin, booker, SC admin).
-- ═══════════════════════════════════════════════════════════════════════════

create policy org_booking_cancellations_admin_read_v2 on public.org_booking_cancellations
  for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      join public.organization_members om
        on om.organization_id = b.organization_id
      where b.id = org_booking_cancellations.booking_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
        -- TODO(rm-ni-split): expand admin set.
    )
  );

create policy org_booking_cancellations_booker_read_v2 on public.org_booking_cancellations
  for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      join public.organization_members om
        on om.organization_id = b.organization_id
      where b.id = org_booking_cancellations.booking_id
        and om.user_id = (select auth.uid())
        and om.role = 'booker'
    )
  );

create policy org_booking_cancellations_sc_admin_read_v2 on public.org_booking_cancellations
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    )
  );

drop policy org_booking_cancellations_read on public.org_booking_cancellations;


-- ═══════════════════════════════════════════════════════════════════════════
-- BUCKET E — organization_contracts (parity, additive)
-- Existing SELECT policies match the matrix and stay:
--   * organization_contracts_member_read      (any member of the org)
--   * organization_contracts_worker_self_read (signed_by_user_id match)
-- No write policies existed. Add INSERT + UPDATE for owner+admin so
-- future contract-edit routes don't need to escalate to service_role.
-- ═══════════════════════════════════════════════════════════════════════════

create policy organization_contracts_admin_insert_v2 on public.organization_contracts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_contracts.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
        -- TODO(rm-ni-split): expand admin set.
    )
  );

create policy organization_contracts_admin_update_v2 on public.organization_contracts
  for update to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_contracts.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
        -- TODO(rm-ni-split): expand admin set.
    )
  )
  with check (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_contracts.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- Documentation comments — RLS review anchor
-- ═══════════════════════════════════════════════════════════════════════════

comment on policy organization_billing_admin_finance_read_v2 on public.organization_billing is
  'D4: SELECT for owner/admin/finance only. Replaces organization_billing_member_rw which exposed Stripe bank fields to viewers.';

comment on policy organization_documents_admin_finance_read_v2 on public.organization_documents is
  'D4: SELECT for owner/admin/finance only. Replaces organization_documents_member_rw which let viewers read/delete RTW + DBS evidence.';

comment on policy organizations_admin_update_v2 on public.organizations is
  'D4: UPDATE for owner+admin only. Replaces organizations_members_update which let any member rename the org / overwrite CQC number.';

comment on policy org_invoices_admin_finance_read_v2 on public.org_invoices is
  'D4: SELECT for owner/admin/finance + SC admin. Replaces org_invoices_member_read which let viewers see line-item PII.';

comment on policy org_booking_offers_admin_read_v2 on public.org_booking_offers is
  'D4: SELECT for owner+admin. Part of the four-way replacement for org_booking_offers_read (permissive any-member).';

comment on policy org_booking_cancellations_admin_read_v2 on public.org_booking_cancellations is
  'D4: SELECT for owner+admin. Part of the three-way replacement for org_booking_cancellations_read (permissive any-member).';
