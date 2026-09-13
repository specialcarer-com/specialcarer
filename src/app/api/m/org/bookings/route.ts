import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import { requireBookerRole } from "@/lib/org/booking-authz";
import {
  SLEEP_IN_ORG_CHARGE_DEFAULT,
  SLEEP_IN_CARER_PAY_DEFAULT,
  type CareCategory,
  type ShiftMode,
} from "@/lib/org/booking-types";
import {
  computeOrgChargeTotalCents,
  computeCarerPayTotalCents,
} from "@/lib/stripe/invoicing";
import type { OrgBooking } from "@/lib/org/booking-types";

// Feature flag reused from D1/D2. When ON, we enforce role-gated
// booking creation (owner/admin/booker only — finance + viewer are
// rejected with 403) and use the actor's own organization_members.id
// as booker_member_id. When OFF, we preserve the pre-D3 behaviour of
// letting any non-viewer member book but fall back to the org
// owner's member id so booker_member_id is still populated (the
// underlying RPC requires it non-null). The RPC path is used in
// BOTH branches — that's the deploy-safe way to stop populating
// booker_member_id inconsistently.
function orgInvitationsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ORG_INVITATIONS_ENABLED === "true";
}

// D3 note on the RPC path: the SQL migration ships a
// `create_org_booking_with_offer` SECURITY DEFINER function that
// atomically inserts a booking row + N offer rows. This route
// currently keeps its explicit INSERT + distributeOffers() path
// because the recurring_4w mode fans out 28 child rows (which the
// single-parent RPC doesn't handle). A follow-up (D3b) will refactor
// the non-recurring path onto the RPC and add the equivalent
// recurring-parent RPC. Meanwhile the RPC exists for future
// consumers and is covered by the concurrency test.

export const dynamic = "force-dynamic";

/** GET /api/m/org/bookings — list org bookings with optional filters */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const service_user_id = url.searchParams.get("service_user_id");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = 20;

  let q = admin
    .from("bookings")
    .select(
      `id, status, shift_mode, starts_at, ends_at, hours, hourly_rate_cents,
       subtotal_cents, currency, service_user_id, caregiver_id,
       booker_name_snapshot, booker_role_snapshot, org_charge_total_cents,
       invoiced_at, stripe_invoice_id, created_at, notes, location_city,
       required_categories, sleep_in_org_charge, sleep_in_carer_pay,
       is_recurring_parent, parent_booking_id`,
      { count: "exact" }
    )
    .eq("organization_id", member.organization_id)
    .eq("booking_source", "org")
    .order("starts_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) q = q.eq("status", status);
  if (service_user_id) q = q.eq("service_user_id", service_user_id);
  if (from) q = q.gte("starts_at", from);
  if (to) q = q.lte("starts_at", to);

  const { data, error, count } = await q;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    bookings: data,
    total: count ?? 0,
    page,
    limit,
  });
}

/**
 * POST /api/m/org/bookings — create a new org booking and distribute offers
 *
 * Body shape: BookingWizardValues (from booking-types.ts)
 *
 * On confirm:
 *  1. Validate org is verified + booking_enabled
 *  2. Validate service user belongs to org
 *  3. Insert booking row (status = pending_offer)
 *  4. Find matched carers (category + skills overlap; simple SQL for MVP)
 *  5. If preferred_carer_id provided, offer to that carer first
 *     else top-5 by category overlap count, or broadcast if requested
 *  6. Insert org_booking_offers rows
 *  7. Update booking status to 'offered'
 *
 * For recurring_4w: creates parent booking + 28 child instances.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // D3: with the flag ON we require the caller be owner/admin/booker
  // (finance + viewer rejected). With the flag OFF we preserve the
  // pre-D3 rule (any non-viewer member) so live orgs don't break
  // when this ships before the flag flips.
  if (orgInvitationsEnabled()) {
    const gate = await requireBookerRole(admin, user.id, member.organization_id);
    if (!gate.ok) {
      if (gate.error === "schema_not_ready") {
        return NextResponse.json(
          { ok: true, skippedReason: "schema_not_ready" },
          { status: 202 },
        );
      }
      return NextResponse.json(
        { error: gate.error === "insufficient_role" ? "insufficient_role" : "Forbidden" },
        { status: 403 },
      );
    }
  } else {
    if (member.role === "viewer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await getOrg(admin, member.organization_id);
  if (!org?.booking_enabled) {
    return NextResponse.json(
      { error: "Booking is not enabled for this organisation. Complete verification first." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const {
    service_user_id,
    shift_mode = "single" as ShiftMode,
    starts_at,
    ends_at,
    active_hours_start,
    active_hours_end,
    sleep_in_org_charge = SLEEP_IN_ORG_CHARGE_DEFAULT,
    sleep_in_carer_pay = SLEEP_IN_CARER_PAY_DEFAULT,
    required_categories = [] as CareCategory[],
    required_skills = [] as string[],
    preferred_carer_id,
    broadcast = false,
    booker_name,
    booker_role,
    notes,
    hourly_rate_cents,
    recurrence_days_of_week,
    recurrence_start_date,
  } = body;

  if (!starts_at || !ends_at || !hourly_rate_cents) {
    return NextResponse.json(
      { error: "starts_at, ends_at, and hourly_rate_cents are required" },
      { status: 400 }
    );
  }

  // Validate service user belongs to this org
  if (service_user_id) {
    const { data: su } = await admin
      .from("service_users")
      .select("id")
      .eq("id", service_user_id)
      .eq("organization_id", member.organization_id)
      .is("archived_at", null)
      .maybeSingle();
    if (!su) {
      return NextResponse.json(
        { error: "Service user not found or not in your organisation" },
        { status: 400 }
      );
    }
  }

  const start = new Date(starts_at);
  const end = new Date(ends_at);
  const hours = Math.round(((end.getTime() - start.getTime()) / 3600000) * 100) / 100;
  const subtotal_cents = Math.round(hours * hourly_rate_cents);
  // Platform fee (for DB record purposes): 25% of subtotal on active hours
  const platform_fee_cents = Math.round(subtotal_cents * 0.25);

  // Build a stub booking object to compute totals
  const bookingStub = {
    shift_mode,
    subtotal_cents,
    sleep_in_org_charge,
    sleep_in_carer_pay,
  } as OrgBooking;

  const org_charge_total_cents = computeOrgChargeTotalCents(bookingStub);
  const carer_pay_total_cents = computeCarerPayTotalCents(bookingStub);

  // ── D3: resolve booker_member_id correctly. ───────────────────────────
  // Prior to D3 this field was populated with member.organization_id
  // (an org uuid, not a member uuid) — the column existed but no live
  // row ever had a correct value in it. Fix: always look up the
  // caller's own organization_members.id. When the D3 flag is OFF and
  // the caller happens to not have a members row yet (legacy edge
  // case), fall back to the org owner's member id so the RPC's NOT
  // NULL invariant is still satisfied.
  const bookerAttribution = await resolveBookerAttribution(
    admin,
    user.id,
    member.organization_id,
    { useOwnerFallback: !orgInvitationsEnabled() },
  );
  if (!bookerAttribution) {
    return NextResponse.json(
      { error: "booker_member_not_found" },
      { status: 500 },
    );
  }

  // TODO(d5-billing-guard): call assertOrgBillingCurrent(admin, org.id)
  // here once D5 lands. If billing status is 'overdue' or 'suspended',
  // return 402 { error: 'billing_overdue' } and skip the booking
  // create. D5 will insert the helper + the response mapping.

  const bookingBase = {
    organization_id: member.organization_id,
    service_user_id: service_user_id || null,
    booker_member_id: bookerAttribution.memberId,
    booker_name_snapshot:
      booker_name || bookerAttribution.fullName || member.full_name || null,
    booker_role_snapshot:
      booker_role || bookerAttribution.role || member.job_title || null,
    booking_source: "org",
    shift_mode,
    starts_at,
    ends_at,
    hours,
    hourly_rate_cents,
    subtotal_cents,
    platform_fee_cents,
    total_cents: subtotal_cents, // 0% client uplift
    currency: org.country === "US" ? "usd" : "gbp",
    service_type: (required_categories[0] as string) || "care_services",
    required_categories,
    required_skills,
    preferred_carer_id: preferred_carer_id || null,
    active_hours_start: active_hours_start || null,
    active_hours_end: active_hours_end || null,
    sleep_in_org_charge,
    sleep_in_carer_pay,
    org_charge_total_cents,
    carer_pay_total_cents,
    notes: notes || null,
    status: "pending_offer",
    // seeker_id required by schema — use org owner's user_id as placeholder
    seeker_id: user.id,
    // caregiver_id optional — will be set when carer accepts
    caregiver_id: user.id, // temp placeholder; updated on acceptance
    offer_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  // For recurring_4w, create parent + 28 children
  if (shift_mode === "recurring_4w") {
    return createRecurringBooking({
      admin,
      bookingBase,
      recurrence_days_of_week: recurrence_days_of_week ?? [],
      recurrence_start_date: recurrence_start_date ?? starts_at.slice(0, 10),
      preferred_carer_id,
      broadcast,
      required_categories,
    });
  }

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .insert({ ...bookingBase, is_recurring_parent: false })
    .select()
    .single();

  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 500 });
  }

  // Distribute offers
  const offerResult = await distributeOffers({
    admin,
    bookingId: booking.id,
    organizationId: member.organization_id,
    preferredCarerId: preferred_carer_id,
    broadcast,
    requiredCategories: required_categories,
    requiredSkills: required_skills,
    bookingStartsAt: starts_at,
    bookingEndsAt: ends_at,
  });

  if (offerResult.carerIds.length > 0) {
    await admin
      .from("bookings")
      .update({ status: "offered", offered_at: new Date().toISOString() })
      .eq("id", booking.id);
  }

  return NextResponse.json(
    { booking: { ...booking, status: offerResult.carerIds.length > 0 ? "offered" : "pending_offer" }, offers_sent: offerResult.carerIds.length },
    { status: 201 }
  );
}

// ── Internal helpers ──────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Resolve the correct `booker_member_id` for the current create-
 * booking call. Returns the caller's own organization_members row
 * first; if that row can't be found and `useOwnerFallback` is true,
 * falls back to the org owner's member id. Returns null when both
 * strategies fail (should be unreachable in practice — the earlier
 * getMyOrgMembership check ensures the caller has a members row).
 *
 * The `useOwnerFallback` branch is the legacy safety valve for when
 * the D3 feature flag is OFF: if a booking is initiated by, say, a
 * service_role script (which has no members row), we still want the
 * booker_member_id column populated so downstream reporting queries
 * don't have to special-case NULL.
 */
async function resolveBookerAttribution(
  admin: AdminClient,
  userId: string,
  organizationId: string,
  opts: { useOwnerFallback: boolean },
): Promise<{ memberId: string; fullName: string | null; role: string | null } | null> {
  const { data: self } = await admin
    .from("organization_members")
    .select("id, full_name, role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string; full_name: string | null; role: string | null }>();
  if (self) {
    return { memberId: self.id, fullName: self.full_name, role: self.role };
  }
  if (!opts.useOwnerFallback) return null;
  const { data: owner } = await admin
    .from("organization_members")
    .select("id, full_name, role")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle<{ id: string; full_name: string | null; role: string | null }>();
  if (owner) {
    return { memberId: owner.id, fullName: owner.full_name, role: "owner" };
  }
  return null;
}

async function distributeOffers({
  admin,
  bookingId,
  organizationId: _organizationId,
  preferredCarerId,
  broadcast,
  requiredCategories,
  requiredSkills: _requiredSkills,
  bookingStartsAt,
  bookingEndsAt,
}: {
  admin: AdminClient;
  bookingId: string;
  organizationId: string;
  preferredCarerId?: string;
  broadcast: boolean;
  requiredCategories: CareCategory[];
  requiredSkills: string[];
  bookingStartsAt?: string;
  bookingEndsAt?: string;
}) {
  let carerIds: string[] = [];

  if (preferredCarerId) {
    carerIds = [preferredCarerId];
  } else {
    // Simple SQL match: verified carers whose care_categories overlap
    // MVP: match on verticals only; Phase C adds geo + skills scoring
    const { data: carers } = await admin
      .from("caregiver_profiles")
      .select("user_id, care_categories")
      .eq("is_published", true)
      .not("user_id", "is", null);

    if (carers) {
      const scored = carers
        .map((c) => {
          const overlap = (c.care_categories as string[] ?? []).filter((cat) =>
            (requiredCategories as string[]).includes(cat)
          ).length;
          return { user_id: c.user_id as string, score: overlap };
        })
        .filter((c) => c.score > 0 || requiredCategories.length === 0)
        .sort((a, b) => b.score - a.score);

      carerIds = broadcast
        ? scored.map((c) => c.user_id)
        : scored.slice(0, 5).map((c) => c.user_id);
    }
  }

  // Phase 2 (Channel B): only carers who have completed the agency opt-in
  // flow may receive org-dispatched bookings. This filter does NOT affect
  // marketplace dispatch — only this org-bookings code path. Applies to
  // both broadcast and preferred-carer flows. The preferred-carer flow
  // will simply return zero offers if that carer hasn't opted in.
  if (carerIds.length > 0) {
    const { data: optedIn } = await admin
      .from("profiles")
      .select("id")
      .in("id", carerIds)
      .eq("agency_opt_in_status", "active");
    const allowed = new Set((optedIn ?? []).map((p) => p.id as string));
    carerIds = carerIds.filter((id) => allowed.has(id));
  }

  // Matcher integration (3.7): exclude carers with approved time-off or
  // blockouts that overlap the booking window. Soft penalty only for
  // missing availability slots (still surfaced — existing behaviour).
  if (carerIds.length > 0 && bookingStartsAt && bookingEndsAt) {
    const bookStart = new Date(bookingStartsAt);
    const bookEnd   = new Date(bookingEndsAt);
    const bookStartDate = bookingStartsAt.slice(0, 10);
    const bookEndDate   = bookingEndsAt.slice(0, 10);

    // Fetch approved time-off for these carers that overlaps booking window
    const { data: timeoffs } = await admin
      .from("caregiver_timeoff_requests")
      .select("user_id, starts_on, ends_on")
      .in("user_id", carerIds)
      .eq("status", "approved")
      .lte("starts_on", bookEndDate)
      .gte("ends_on",   bookStartDate);

    // Fetch blockouts that overlap booking window
    const { data: blockouts } = await admin
      .from("caregiver_blockouts")
      .select("user_id, starts_on, ends_on")
      .in("user_id", carerIds)
      .lte("starts_on", bookEndDate)
      .gte("ends_on",   bookStartDate);

    const blockedSet = new Set<string>();
    for (const row of [...(timeoffs ?? []), ...(blockouts ?? [])]) {
      // Exact overlap: row range [starts_on, ends_on+1day) vs [bookStart, bookEnd)
      const rowStart = new Date(row.starts_on + "T00:00:00");
      const rowEnd   = new Date(row.ends_on   + "T23:59:59");
      if (rowStart <= bookEnd && rowEnd >= bookStart) {
        blockedSet.add(row.user_id);
      }
    }

    if (blockedSet.size > 0) {
      carerIds = carerIds.filter((id) => !blockedSet.has(id));
    }
  }

  if (carerIds.length > 0) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await admin.from("org_booking_offers").insert(
      carerIds.map((carer_id) => ({
        booking_id: bookingId,
        carer_id,
        status: "pending",
        expires_at: expiresAt,
      }))
    );
  }

  return { carerIds };
}

async function createRecurringBooking({
  admin,
  bookingBase,
  recurrence_days_of_week,
  recurrence_start_date,
  preferred_carer_id,
  broadcast,
  required_categories,
}: {
  admin: AdminClient;
  bookingBase: Record<string, unknown>;
  recurrence_days_of_week: number[];
  recurrence_start_date: string;
  preferred_carer_id?: string;
  broadcast: boolean;
  required_categories: CareCategory[];
}) {
  // Create parent
  const { data: parent, error: parentError } = await admin
    .from("bookings")
    .insert({ ...bookingBase, is_recurring_parent: true })
    .select()
    .single();

  if (parentError) {
    return NextResponse.json({ error: parentError.message }, { status: 500 });
  }

  // Generate 28 child instances based on recurrence_days_of_week
  const children: Record<string, unknown>[] = [];
  const startDate = new Date(recurrence_start_date);
  let index = 0;

  for (let day = 0; day < 28 && children.length < 28; day++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + day);
    if (
      recurrence_days_of_week.length === 0 ||
      recurrence_days_of_week.includes(date.getDay())
    ) {
      const childStart = new Date(bookingBase.starts_at as string);
      const childEnd = new Date(bookingBase.ends_at as string);
      childStart.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      childEnd.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());

      children.push({
        ...bookingBase,
        parent_booking_id: parent.id,
        recurrence_index: index,
        is_recurring_parent: false,
        starts_at: childStart.toISOString(),
        ends_at: childEnd.toISOString(),
        status: "pending_offer",
      });
      index++;
      if (index >= 28) break;
    }
  }

  if (children.length > 0) {
    await admin.from("bookings").insert(children);
  }

  // Distribute offers on parent
  const offerResult = await distributeOffers({
    admin,
    bookingId: parent.id,
    organizationId: parent.organization_id as string,
    preferredCarerId: preferred_carer_id,
    broadcast,
    requiredCategories: required_categories,
    requiredSkills: [],
    bookingStartsAt: parent.starts_at as string | undefined,
    bookingEndsAt: parent.ends_at as string | undefined,
  });

  if (offerResult.carerIds.length > 0) {
    await admin
      .from("bookings")
      .update({ status: "offered", offered_at: new Date().toISOString() })
      .eq("id", parent.id);
  }

  return NextResponse.json(
    {
      booking: parent,
      child_count: children.length,
      offers_sent: offerResult.carerIds.length,
    },
    { status: 201 }
  );
}
