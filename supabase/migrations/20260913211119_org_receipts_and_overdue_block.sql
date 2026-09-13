-- ============================================================================
-- SpecialCarer — D5: Overdue-invoice booking block + org receipts
--
-- Ships three related pieces in one migration (all additive, no destructive
-- DDL, no `DROP` statements; therefore NO `Allow-Destructive: true` trailer
-- required on the commit or PR body):
--
--   1. Overdue-invoice booking block
--      * NEW helper function public.has_overdue_invoices(uuid) → boolean.
--      * Modified SECURITY DEFINER RPC public.create_org_booking_with_offer
--        via CREATE OR REPLACE FUNCTION (full 26-parameter signature
--        preserved verbatim from prod — see below); a single overdue
--        check is inserted at the top of the function body.
--
--   2. Org receipts
--      * NEW table public.org_receipts (one row per completed org
--        booking) with RLS enabled + role-gated policies (owner/admin/
--        finance read; SC admin all-access; no INSERT/UPDATE/DELETE
--        for org members — service_role only via the trigger).
--      * NEW SEQUENCE public.org_receipt_number_seq — monotonic forever
--        (no yearly reset), used to render human-readable
--        `SC-R-YYYY-NNNNNN` receipt numbers via the trigger.
--      * NEW trigger public.generate_org_receipt_on_completion() +
--        trg_generate_org_receipt_on_completion on public.bookings.
--        Fires AFTER INSERT OR UPDATE OF status, WHEN
--        (NEW.organization_id IS NOT NULL AND NEW.status = 'completed').
--        Only creates a row on true transition INTO completed
--        (defensive OLD.status check + unique(booking_id) as the final
--        backstop).
--
-- ---------------------------------------------------------------------------
-- Verified against prod (project qupjaanyhnuvlexkwtpq) on 13 Sep 2026 via the
-- Supabase Management API using information_schema.columns +
-- pg_get_functiondef:
--
--   * org_invoices columns: id, organization_id, booking_id,
--     stripe_invoice_id, stripe_customer_id, status (CHECK IN
--     ('draft','open','paid','void','uncollectible')), amount_due_cents,
--     amount_paid_cents, currency, due_date (date NULL),
--     hosted_invoice_url, invoice_pdf_url, created_at, updated_at,
--     internal_state, finalise_after.  → overdue predicate uses
--     status IN ('open','uncollectible') AND due_date IS NOT NULL AND
--     due_date < CURRENT_DATE AND amount_paid_cents < amount_due_cents.
--
--   * bookings columns actually present that the trigger snapshots:
--     id, organization_id (nullable), booker_member_id, seeker_id,
--     caregiver_id (NOT `assigned_carer_id`), service_user_id,
--     service_type, starts_at, ends_at, currency,
--     org_charge_total_cents, total_cents, status (booking_status enum),
--     booker_name_snapshot. The brief mentioned `assigned_carer_id` —
--     that column does not exist. Verified across src/lib/**/*.ts and
--     information_schema; the app-level identifier is `caregiver_id`.
--
--   * profiles.full_name exists (text NULL). organization_members
--     also has its own full_name column, so booker snapshot goes
--     via organization_members (booker_member_id → member) not
--     profiles (which would require an extra hop through user_id).
--
--   * service_users table exists with a full_name (text NOT NULL) column.
--
--   * booking_status enum values include 'completed'. Verified via
--     the D3 delivery report (also unchanged by D4 / D4-fix).
--
--   * create_org_booking_with_offer(...) prod signature captured
--     verbatim from pg_get_functiondef and preserved 1:1 below. Only
--     addition: a single IF public.has_overdue_invoices(...) block at
--     the top of the function body, after BEGIN. Everything else
--     (booker snapshot lookup, INSERT INTO public.bookings, foreach
--     over p_carer_ids inserting into public.org_booking_offers,
--     RETURN v_booking_id) is byte-for-byte identical to prod.
--
--   * Existing helpers audited: no has_overdue_invoices, no
--     org_billing_status, no org_receipts table, no receipt sequence,
--     no receipt trigger. All fresh work.
--
--   * Row counts at time of migration authoring:
--       org_invoices: 0 rows (block never triggers at merge —
--         pure preventive infra).
--       bookings WHERE organization_id IS NOT NULL: 4 rows.
--       … WHERE ... AND status='completed': 4 rows.
--
--     The 4 existing completed org bookings will NOT receive backfilled
--     receipts. The trigger is AFTER INSERT OR UPDATE OF status with a
--     WHEN guard, and the OLD.status check inside the function body
--     ensures we only fire on transition INTO completed (not on
--     completed→completed status touches). A one-shot backfill for
--     historical receipts is intentionally out of scope for D5 and
--     is called out in the D5 runbook.
--
-- ---------------------------------------------------------------------------
-- No `DROP` statements. Additive only. No destructive-migration trailer
-- needed on the commit or PR body.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper function — has_overdue_invoices(organization_id)
-- ---------------------------------------------------------------------------
-- STABLE, SECURITY INVOKER: the caller (RPC or route) is trusted; RLS on
-- org_invoices is not bypassed. This is called from a SECURITY DEFINER
-- RPC below AND from the API route directly (with a service-role admin
-- client), so it must remain a plain SQL function and NOT SECURITY
-- DEFINER — that keeps behaviour identical in both call sites.

CREATE OR REPLACE FUNCTION public.has_overdue_invoices(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_invoices
     WHERE organization_id = p_organization_id
       AND status IN ('open', 'uncollectible')
       AND due_date IS NOT NULL
       AND due_date < CURRENT_DATE
       AND amount_paid_cents < amount_due_cents
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_overdue_invoices(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.has_overdue_invoices(uuid) IS
  'D5: returns true when the org has at least one invoice in ' ||
  'status open|uncollectible with a due_date strictly in the past ' ||
  'and amount_paid_cents < amount_due_cents. Called from ' ||
  'create_org_booking_with_offer to block new bookings and from ' ||
  'POST /api/m/org/bookings to short-circuit with HTTP 402.';


-- ---------------------------------------------------------------------------
-- 2. RPC modification — create_org_booking_with_offer
-- ---------------------------------------------------------------------------
-- Full 26-parameter signature preserved verbatim from the D3 definition
-- (verified via pg_get_functiondef against prod on 13 Sep 2026). The
-- only change is the IF public.has_overdue_invoices(p_organization_id)
-- guard block inserted at the top of the function body, immediately
-- after `begin`.
--
-- Error code is P0001 (raise_exception) with the sentinel prefix
-- `ORG_HAS_OVERDUE_INVOICES:` so the route layer can pattern-match on
-- the error message and return the correct HTTP 402 response. Postgres
-- doesn't have a natural code for "business rule violation — payment
-- required" so we lean on the message prefix; see D5 runbook for the
-- mapping.

CREATE OR REPLACE FUNCTION public.create_org_booking_with_offer(
  p_organization_id uuid,
  p_booker_member_id uuid,
  p_service_type text,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone,
  p_hours numeric,
  p_hourly_rate_cents integer,
  p_subtotal_cents integer,
  p_currency text,
  p_seeker_id uuid,
  p_carer_ids uuid[],
  p_service_user_id uuid DEFAULT NULL::uuid,
  p_preferred_carer_id uuid DEFAULT NULL::uuid,
  p_required_categories text[] DEFAULT '{}'::text[],
  p_required_skills text[] DEFAULT '{}'::text[],
  p_shift_mode shift_mode DEFAULT 'single'::shift_mode,
  p_active_hours_start time without time zone DEFAULT NULL::time without time zone,
  p_active_hours_end time without time zone DEFAULT NULL::time without time zone,
  p_sleep_in_org_charge numeric DEFAULT 100.00,
  p_sleep_in_carer_pay numeric DEFAULT 50.00,
  p_org_charge_total_cents integer DEFAULT NULL::integer,
  p_carer_pay_total_cents integer DEFAULT NULL::integer,
  p_platform_fee_cents integer DEFAULT NULL::integer,
  p_total_cents integer DEFAULT NULL::integer,
  p_notes text DEFAULT NULL::text,
  p_status booking_status DEFAULT 'pending_offer'::booking_status,
  p_offer_ttl_hours integer DEFAULT 24
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_booking_id uuid;
  v_booker_name text;
  v_booker_role text;
  v_carer uuid;
  v_offer_expires_at timestamptz := now() + make_interval(hours => p_offer_ttl_hours);
begin
  -- D5: hard-stop new bookings when the org has overdue invoices.
  -- Sentinel prefix `ORG_HAS_OVERDUE_INVOICES:` is what the route
  -- layer pattern-matches on to return HTTP 402. Do not rename.
  if public.has_overdue_invoices(p_organization_id) then
    raise exception 'ORG_HAS_OVERDUE_INVOICES: cannot create bookings while organisation has overdue invoices'
      using errcode = 'P0001',
            hint = 'Pay outstanding invoices at /m/org/billing before booking';
  end if;

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
$function$;


-- ---------------------------------------------------------------------------
-- 3. Org receipts — sequence + table + RLS + trigger
-- ---------------------------------------------------------------------------
-- Sequence is monotonic FOREVER — no yearly reset. Rationale: annual
-- reset requires either an out-of-band cron or a stateful function to
-- detect the year rollover atomically under concurrent inserts. Both
-- are extra machinery for zero user-facing benefit — receipt numbers
-- are still human-readable (`SC-R-YYYY-NNNNNN`) and monotonically
-- increasing across years is fine for audit. Documented in the runbook.

CREATE SEQUENCE IF NOT EXISTS public.org_receipt_number_seq
  START 1
  MINVALUE 1
  NO CYCLE;

GRANT USAGE ON SEQUENCE public.org_receipt_number_seq TO service_role;

COMMENT ON SEQUENCE public.org_receipt_number_seq IS
  'D5: monotonic-forever sequence for org receipt numbers. Rendered ' ||
  'as SC-R-YYYY-NNNNNN in generate_org_receipt_on_completion. Never ' ||
  'reset.';


CREATE TABLE IF NOT EXISTS public.org_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  invoice_id uuid NULL REFERENCES public.org_invoices(id) ON DELETE SET NULL,
  receipt_number text NOT NULL UNIQUE,  -- format: SC-R-YYYY-NNNNNN
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'gbp',
  service_description text NOT NULL,
  booking_starts_at timestamptz NOT NULL,
  booking_ends_at timestamptz NOT NULL,
  carer_name_snapshot text NOT NULL,
  booker_name_snapshot text NOT NULL,
  service_user_name_snapshot text NULL,
  receipt_pdf_url text NULL,   -- filled by downstream PDF job (out of scope for D5)
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id)          -- one receipt per booking
);

CREATE INDEX IF NOT EXISTS org_receipts_org_idx
  ON public.org_receipts (organization_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS org_receipts_booking_idx
  ON public.org_receipts (booking_id);
CREATE INDEX IF NOT EXISTS org_receipts_invoice_idx
  ON public.org_receipts (invoice_id)
  WHERE invoice_id IS NOT NULL;

ALTER TABLE public.org_receipts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.org_receipts IS
  'D5: one row per completed org booking. Written by the ' ||
  'generate_org_receipt_on_completion trigger (SECURITY DEFINER). ' ||
  'No INSERT/UPDATE/DELETE policies for org members — trigger + ' ||
  'service_role only. Downstream: receipt_pdf_url is filled by a ' ||
  'PDF-generation job (out of scope for D5).';


-- ── RLS policies ─────────────────────────────────────────────────────
-- Receipts are finance-sensitive — mirror the D4 org_invoices matrix.
-- Only owner/admin/finance may read within an org; SC admin gets
-- all-access. No write policies for org members (service_role only
-- via the trigger below).

CREATE POLICY org_receipts_admin_finance_read_v2
  ON public.org_receipts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
       WHERE m.user_id = (SELECT auth.uid())
         AND m.organization_id = org_receipts.organization_id
         AND m.role IN ('owner', 'admin', 'finance')
        -- TODO(rm-ni-split): expand admin set once the RM/NI role
        -- split lands (mirrors the D4 lockdown pattern).
    )
  );

CREATE POLICY org_receipts_sc_admin_all_v2
  ON public.org_receipts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = (SELECT auth.uid())
         AND role = 'admin'
        -- TODO(rm-ni-split): admin set expansion, same reason as above.
    )
  );


-- ---------------------------------------------------------------------------
-- 4. Trigger — generate_org_receipt_on_completion
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the trigger can INSERT into org_receipts under a
-- policy-free path (no `WITH CHECK` policy exists for org members).
-- The service_role owner + SET search_path fully qualifies every ref.
--
-- Fires AFTER INSERT OR UPDATE OF status on public.bookings. The WHEN
-- clause narrows to org bookings transitioning INTO completed. The
-- OLD.status check inside the function body defensively skips
-- completed→completed no-op updates (RLS UPDATE that touches other
-- columns while status stays 'completed'). Final backstop is the
-- unique(booking_id) constraint: a duplicate fire raises 23505 and
-- rolls back the single INSERT, without corrupting the original
-- bookings UPDATE (because the receipt insert is inside an AFTER
-- trigger — the surrounding UPDATE completes first, then this fires).
-- To keep such races invisible to the caller, we EXIT EARLY via the
-- EXISTS check below rather than let a duplicate insert raise.

CREATE OR REPLACE FUNCTION public.generate_org_receipt_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_carer_name text;
  v_booker_name text;
  v_service_user_name text;
  v_invoice_id uuid;
BEGIN
  -- Only for org bookings (WHEN clause already enforces this, but
  -- keep the defensive check for direct-call safety if the trigger
  -- is ever invoked out-of-band).
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only fire on genuine transition INTO completed. Skips
  -- completed→completed no-op status touches. For INSERT, OLD is
  -- NULL, so this branch does the right thing (treat as transition).
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Defensive: skip if a receipt already exists. Prevents duplicate
  -- constraint violation on re-firings that get past the WHEN clause
  -- and the OLD.status check (belt-and-braces — one-row-per-booking
  -- semantics are still enforced by the UNIQUE (booking_id) index).
  IF EXISTS (SELECT 1 FROM public.org_receipts WHERE booking_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Snapshot the carer's display name (caregiver_id → profiles.full_name).
  -- Falls back to 'Unknown Carer' if the profile row has been deleted
  -- (defensive: RESTRICT on the FK would only stop bookings deletion,
  -- profiles is upstream of that).
  IF NEW.caregiver_id IS NOT NULL THEN
    SELECT full_name INTO v_carer_name
      FROM public.profiles
     WHERE id = NEW.caregiver_id;
  END IF;
  v_carer_name := COALESCE(v_carer_name, 'Unknown Carer');

  -- Snapshot the booker's display name. Prefer the organization_members
  -- row (which is what booker_member_id points at); fall back to the
  -- booker_name_snapshot column that the D3 RPC already writes to the
  -- bookings row at creation time; final fallback 'Unknown Booker'.
  IF NEW.booker_member_id IS NOT NULL THEN
    SELECT full_name INTO v_booker_name
      FROM public.organization_members
     WHERE id = NEW.booker_member_id;
  END IF;
  v_booker_name := COALESCE(v_booker_name, NEW.booker_name_snapshot, 'Unknown Booker');

  -- Snapshot the service user's display name (optional — NULL for
  -- direct-carer bookings that don't reference a service user).
  IF NEW.service_user_id IS NOT NULL THEN
    SELECT full_name INTO v_service_user_name
      FROM public.service_users
     WHERE id = NEW.service_user_id;
  END IF;

  -- Look up the most recent invoice for this booking (nullable FK —
  -- receipts precede invoices in some flows; also invoice may already
  -- be void or paid, we just link the latest).
  SELECT id INTO v_invoice_id
    FROM public.org_invoices
   WHERE booking_id = NEW.id
   ORDER BY created_at DESC
   LIMIT 1;

  INSERT INTO public.org_receipts (
    organization_id,
    booking_id,
    invoice_id,
    receipt_number,
    amount_cents,
    currency,
    service_description,
    booking_starts_at,
    booking_ends_at,
    carer_name_snapshot,
    booker_name_snapshot,
    service_user_name_snapshot
  ) VALUES (
    NEW.organization_id,
    NEW.id,
    v_invoice_id,
    'SC-R-' || to_char(now(), 'YYYY') || '-'
             || lpad(nextval('public.org_receipt_number_seq')::text, 6, '0'),
    COALESCE(NEW.org_charge_total_cents, NEW.total_cents, 0),
    NEW.currency,
    NEW.service_type,
    NEW.starts_at,
    NEW.ends_at,
    v_carer_name,
    v_booker_name,
    v_service_user_name
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.generate_org_receipt_on_completion() IS
  'D5: writes one org_receipts row on booking transition INTO ' ||
  'completed. SECURITY DEFINER. Idempotent via the EXISTS check + ' ||
  'UNIQUE (booking_id) backstop.';


-- Trigger. WHEN clause narrows the firing surface at the executor
-- level so the function body isn't entered for irrelevant updates.
-- INSERT: OLD is NULL — the WHEN clause still fires because it only
-- references NEW; the function body's OLD-vs-NEW branch handles the
-- INSERT case (TG_OP = 'INSERT' → OLD IS NULL → not equal to
-- 'completed' → we fall through and insert the receipt).

-- No DROP TRIGGER IF EXISTS prelude — this trigger is fresh (verified
-- no `trg_generate_org_receipt_on_completion` exists via pg_trigger
-- on 13 Sep 2026). Keeping this file free of `DROP` statements means
-- no `Allow-Destructive: true` trailer is required.
CREATE TRIGGER trg_generate_org_receipt_on_completion
  AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (NEW.organization_id IS NOT NULL AND NEW.status = 'completed')
  EXECUTE FUNCTION public.generate_org_receipt_on_completion();

-- ── End D5 migration ───────────────────────────────────────────────────
