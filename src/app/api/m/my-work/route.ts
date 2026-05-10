import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { firstName } from "@/lib/jobs/sanitize";

export const dynamic = "force-dynamic";

export type WorkTab =
  | "inbox"
  | "applied"
  | "upcoming"
  | "in_progress"
  | "completed"
  | "declined";

export type MyWorkBooking = {
  id: string;
  starts_at: string;
  ends_at: string;
  hours: number;
  hourly_rate_cents: number;
  currency: string;
  service_type: string;
  shift_mode: string | null;
  location_city: string | null;
  location_postcode: string | null;
  seeker_first_name: string;
  seeker_avatar_url: string | null;
  organization_name: string | null;
  status: string;
  accepted_at: string | null;
  declined_at: string | null;
  actual_started_at: string | null;
  checked_out_at: string | null;
  offer_expires_at: string | null;
  booking_source: string | null;
};

type BookingRow = {
  id: string;
  seeker_id: string;
  caregiver_id: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  hours: number;
  hourly_rate_cents: number;
  currency: string;
  service_type: string;
  shift_mode: string | null;
  location_city: string | null;
  location_postcode: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  actual_started_at: string | null;
  checked_out_at: string | null;
  offer_expires_at: string | null;
  booking_source: string | null;
  preferred_carer_id: string | null;
};

/**
 * GET /api/m/my-work?tab=inbox|applied|upcoming|in_progress|completed|declined
 *
 * Carer-only. Returns the booking list for the requested work-inbox tab,
 * enriched with seeker display name + avatar and org name where applicable.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Verify role = caregiver
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();

  if (profile?.role !== "caregiver") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tab = (req.nextUrl.searchParams.get("tab") ?? "inbox") as WorkTab;
  const validTabs: WorkTab[] = [
    "inbox",
    "applied",
    "upcoming",
    "in_progress",
    "completed",
    "declined",
  ];
  if (!validTabs.includes(tab)) {
    return NextResponse.json({ error: "Invalid tab" }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const BASE_FIELDS =
    "id, seeker_id, caregiver_id, status, starts_at, ends_at, hours, hourly_rate_cents, currency, service_type, shift_mode, location_city, location_postcode, accepted_at, declined_at, actual_started_at, checked_out_at, offer_expires_at, booking_source, preferred_carer_id";

  let query = admin
    .from("bookings")
    .select(BASE_FIELDS)
    .eq("caregiver_id", user.id);

  switch (tab) {
    case "inbox":
      query = query
        .is("declined_at", null)
        .or(
          `status.eq.offered,and(status.eq.pending,preferred_carer_id.eq.${user.id})`,
        )
        .or(`offer_expires_at.is.null,offer_expires_at.gt.${now}`)
        .order("offer_expires_at", { ascending: true, nullsFirst: false })
        .limit(30);
      break;

    case "applied":
      // v1: no applications table — return empty list
      return NextResponse.json({ bookings: [] });

    case "upcoming":
      query = query
        .in("status", ["accepted", "paid"])
        .gt("starts_at", now)
        .is("actual_started_at", null)
        .is("cancelled_at", null)
        .order("starts_at", { ascending: true })
        .limit(30);
      break;

    case "in_progress":
      query = query
        .or(
          `status.eq.in_progress,and(actual_started_at.not.is.null,checked_out_at.is.null)`,
        )
        .order("actual_started_at", { ascending: false })
        .limit(30);
      break;

    case "completed":
      query = query
        .or(
          `status.in.(completed,paid_out),shift_completed_at.not.is.null`,
        )
        .order("starts_at", { ascending: false })
        .limit(30);
      break;

    case "declined":
      query = query
        .or(`declined_at.not.is.null,status.eq.cancelled`)
        .order("starts_at", { ascending: false })
        .limit(30);
      break;
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error("[my-work] query error", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const bookingRows = (rows ?? []) as BookingRow[];

  if (bookingRows.length === 0) {
    return NextResponse.json({ bookings: [] });
  }

  // Bulk-fetch seeker profiles
  const seekerIds = [...new Set(bookingRows.map((r) => r.seeker_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", seekerIds);

  const profilesById = new Map<
    string,
    { full_name: string | null; avatar_url: string | null }
  >();
  for (const p of (profiles ?? []) as {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  }[]) {
    profilesById.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url });
  }

  // Bulk-fetch org names for org-routed bookings
  const orgBookingIds = bookingRows
    .filter((r) => r.booking_source === "org")
    .map((r) => r.id);

  const orgNameById = new Map<string, string | null>();
  if (orgBookingIds.length > 0) {
    // org_booking_offers links booking → offer → org; simpler: join via
    // org_booking_offers.booking_id → organizations via a lateral join isn't
    // available in Supabase REST, so we do a two-step: offers → booking_ids
    const { data: offerRows } = await admin
      .from("org_booking_offers")
      .select("booking_id, organization_id")
      .in("booking_id", orgBookingIds);

    if (offerRows && offerRows.length > 0) {
      const typedOfferRows = offerRows as {
        booking_id: string;
        organization_id: string;
      }[];
      const orgIds = [...new Set(typedOfferRows.map((o) => o.organization_id))];
      const { data: orgs } = await admin
        .from("organizations")
        .select("id, name")
        .in("id", orgIds);

      const orgNameByOrgId = new Map<string, string>();
      for (const o of (orgs ?? []) as { id: string; name: string }[]) {
        orgNameByOrgId.set(o.id, o.name);
      }
      for (const offerRow of typedOfferRows) {
        const name = orgNameByOrgId.get(offerRow.organization_id) ?? null;
        orgNameById.set(offerRow.booking_id, name);
      }
    }
  }

  const bookings: MyWorkBooking[] = bookingRows.map((r) => {
    const p = profilesById.get(r.seeker_id);
    return {
      id: r.id,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      hours: r.hours,
      hourly_rate_cents: r.hourly_rate_cents,
      currency: r.currency,
      service_type: r.service_type,
      shift_mode: r.shift_mode,
      location_city: r.location_city,
      location_postcode: r.location_postcode,
      seeker_first_name: firstName(p?.full_name ?? null),
      seeker_avatar_url: p?.avatar_url ?? null,
      organization_name: orgNameById.get(r.id) ?? null,
      status: r.status,
      accepted_at: r.accepted_at,
      declined_at: r.declined_at,
      actual_started_at: r.actual_started_at,
      checked_out_at: r.checked_out_at,
      offer_expires_at: r.offer_expires_at,
      booking_source: r.booking_source,
    };
  });

  return NextResponse.json({ bookings });
}
