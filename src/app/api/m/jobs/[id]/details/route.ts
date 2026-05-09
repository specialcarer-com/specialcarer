import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CARER_FEE_PERCENT,
  carerFeeCents,
  carerPayoutCents,
} from "@/lib/fees/config";
import {
  firstName,
  partialPostcode,
  sanitizeRecipient,
  type RawRecipient,
  type SanitizedRecipient,
} from "@/lib/jobs/sanitize";

export const dynamic = "force-dynamic";

type Aggregate = {
  rating_avg: number | null;
  rating_count: number;
  completed_bookings: number;
  last_completed_at: string | null;
};

export type PayBreakdown = {
  hours: number;
  hourly_rate_cents: number;
  subtotal_cents: number;
  carer_fee_cents: number;
  carer_fee_percent: number;
  earnings_cents: number;
  currency: string;
  /** ISO country code for the tax pointer link. */
  tax_country: "GB" | "US";
  /** Phase B: sleep-in extras (undefined for non-sleep-in shifts) */
  sleep_in_carer_pay?: number;
  sleep_in_carer_pay_cents?: number;
};

type SeekerSummary = {
  first_name: string;
  initial: string;
  aggregate: Aggregate;
  is_repeat: boolean;
};

type CommonResponse = {
  pay_breakdown: PayBreakdown;
  seeker: SeekerSummary;
};

type TargetedDetails = CommonResponse & {
  kind: "targeted";
  booking: {
    id: string;
    status: string;
    starts_at: string;
    ends_at: string;
    hours: number;
    hourly_rate_cents: number;
    currency: string;
    service_type: string;
    location_city: string | null;
    location_country: string | null;
    location_postcode_partial: string | null;
    location_postcode_full: string | null;
    notes: string | null;
    accepted_at: string | null;
    discovery_expires_at: string | null;
    full_address_revealed: boolean;
    /** Phase B: org booking fields (null for regular bookings) */
    is_org_booking: boolean;
    shift_mode: string | null;
    sleep_in_carer_pay: number | null;
  };
  recipients: SanitizedRecipient[];
  recipient_access_instructions: string | null;
};

type OpenDetails = CommonResponse & {
  kind: "open";
  request: {
    id: string;
    status: string;
    starts_at: string;
    ends_at: string;
    hours: number;
    hourly_rate_cents: number;
    currency: string;
    service_type: string;
    location_city: string | null;
    location_country: string | null;
    location_postcode_partial: string | null;
    expires_at: string;
    notes: string | null;
  };
};

function buildPayBreakdown(args: {
  hours: number;
  hourly_rate_cents: number;
  subtotal_cents?: number | null;
  currency: string;
  country: string | null;
  /** Phase B: org sleep-in allowance for this carer (£ decimal) */
  sleep_in_carer_pay?: number | null;
  shift_mode?: string | null;
}): PayBreakdown {
  const subtotal =
    typeof args.subtotal_cents === "number" && args.subtotal_cents > 0
      ? args.subtotal_cents
      : Math.round(args.hours * args.hourly_rate_cents);
  const isSleepIn = args.shift_mode === "sleep_in" && args.sleep_in_carer_pay != null;
  const sleepInCents = isSleepIn ? Math.round((args.sleep_in_carer_pay ?? 0) * 100) : 0;
  // For org sleep-in: active hours pay (75%) + sleep_in_carer_pay
  // For regular shifts: carerPayoutCents (standard 75%)
  const earnings = isSleepIn
    ? carerPayoutCents(subtotal) + sleepInCents
    : carerPayoutCents(subtotal);
  return {
    hours: args.hours,
    hourly_rate_cents: args.hourly_rate_cents,
    subtotal_cents: subtotal,
    carer_fee_cents: carerFeeCents(subtotal),
    carer_fee_percent: CARER_FEE_PERCENT,
    earnings_cents: earnings,
    currency: args.currency,
    tax_country: args.country === "US" ? "US" : "GB",
    ...(isSleepIn && {
      sleep_in_carer_pay: args.sleep_in_carer_pay ?? undefined,
      sleep_in_carer_pay_cents: sleepInCents,
    }),
  };
}

/**
 * GET /api/m/jobs/[id]/details?kind=targeted|open
 *
 * Carer-only. Returns enhanced pre-acceptance detail:
 *  • Sanitised seeker summary (first name + aggregate + repeat flag)
 *  • Sanitised recipients (kind=targeted only — open requests don't
 *    yet link recipient rows)
 *  • Pay breakdown with carer fee + take-home
 *  • Address visibility flag (full address only revealed once the
 *    booking is accepted/paid)
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "open" ? "open" : "targeted";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const admin = createAdminClient();

  if (kind === "targeted") {
    const { data: bookingRow } = await admin
      .from("bookings")
      .select(
        "id, seeker_id, caregiver_id, status, starts_at, ends_at, hours, hourly_rate_cents, subtotal_cents, currency, service_type, location_city, location_country, location_postcode, recipient_ids, notes, accepted_at, discovery_expires_at, booking_source, shift_mode, sleep_in_carer_pay",
      )
      .eq("id", id)
      .maybeSingle<{
        id: string;
        seeker_id: string;
        caregiver_id: string | null;
        status: string;
        starts_at: string;
        ends_at: string;
        hours: number;
        hourly_rate_cents: number;
        subtotal_cents: number | null;
        currency: string;
        service_type: string;
        location_city: string | null;
        location_country: string | null;
        location_postcode: string | null;
        recipient_ids: string[] | null;
        notes: string | null;
        accepted_at: string | null;
        discovery_expires_at: string | null;
        booking_source: string | null;
        shift_mode: string | null;
        sleep_in_carer_pay: number | null;
      }>();
    if (!bookingRow) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (bookingRow.caregiver_id !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const fullAddressRevealed = ["accepted", "paid", "in_progress", "completed", "paid_out"].includes(
      bookingRow.status,
    );

    // Seeker summary in parallel.
    const [profRes, aggRes, repeatRes] = await Promise.all([
      admin
        .from("profiles")
        .select("full_name")
        .eq("id", bookingRow.seeker_id)
        .maybeSingle<{ full_name: string | null }>(),
      admin.rpc("get_seeker_aggregates", {
        p_seeker_id: bookingRow.seeker_id,
      }),
      admin.rpc("is_repeat_client", {
        p_seeker_id: bookingRow.seeker_id,
        p_carer_id: user.id,
      }),
    ]);
    const aggRow =
      Array.isArray(aggRes.data) && aggRes.data.length > 0
        ? (aggRes.data[0] as Aggregate)
        : null;
    const aggregate: Aggregate = aggRow ?? {
      rating_avg: null,
      rating_count: 0,
      completed_bookings: 0,
      last_completed_at: null,
    };

    const seeker: SeekerSummary = {
      first_name: firstName(profRes.data?.full_name ?? null),
      initial: firstName(profRes.data?.full_name ?? null)
        .slice(0, 1)
        .toUpperCase(),
      aggregate,
      is_repeat: !!repeatRes.data,
    };

    // Recipients — sanitised. Filter to recipients owned by this seeker
    // as a defence in depth.
    let recipients: SanitizedRecipient[] = [];
    let access_instructions: string | null = null;
    const ids = (bookingRow.recipient_ids ?? []).filter(
      (x): x is string => typeof x === "string" && x.length > 0,
    );
    if (ids.length > 0) {
      const { data: recRows } = await admin
        .from("household_recipients")
        .select(
          "id, owner_id, kind, display_name, date_of_birth, allergies, medical_conditions, mobility_level, special_needs, property_size, has_pets, access_instructions",
        )
        .in("id", ids)
        .eq("owner_id", bookingRow.seeker_id);
      const safe = (recRows ?? []) as Array<
        RawRecipient & {
          owner_id: string;
          access_instructions: string | null;
        }
      >;
      recipients = safe.map(sanitizeRecipient);
      if (fullAddressRevealed) {
        const merged = safe
          .map((r) => r.access_instructions?.trim())
          .filter((s): s is string => !!s)
          .join("\n\n");
        access_instructions = merged || null;
      }
    }

    const payload: TargetedDetails = {
      kind: "targeted",
      booking: {
        id: bookingRow.id,
        status: bookingRow.status,
        starts_at: bookingRow.starts_at,
        ends_at: bookingRow.ends_at,
        hours: Number(bookingRow.hours),
        hourly_rate_cents: bookingRow.hourly_rate_cents,
        currency: bookingRow.currency,
        service_type: bookingRow.service_type,
        location_city: bookingRow.location_city,
        location_country: bookingRow.location_country,
        location_postcode_partial: partialPostcode(bookingRow.location_postcode),
        location_postcode_full: fullAddressRevealed
          ? bookingRow.location_postcode
          : null,
        notes: bookingRow.notes,
        accepted_at: bookingRow.accepted_at,
        discovery_expires_at: bookingRow.discovery_expires_at,
        full_address_revealed: fullAddressRevealed,
        is_org_booking: bookingRow.booking_source === "org",
        shift_mode: bookingRow.shift_mode ?? null,
        sleep_in_carer_pay: bookingRow.sleep_in_carer_pay ?? null,
      },
      recipients,
      recipient_access_instructions: access_instructions,
      pay_breakdown: buildPayBreakdown({
        hours: Number(bookingRow.hours),
        hourly_rate_cents: bookingRow.hourly_rate_cents,
        subtotal_cents: bookingRow.subtotal_cents,
        currency: bookingRow.currency,
        country: bookingRow.location_country,
        shift_mode: bookingRow.shift_mode ?? null,
        sleep_in_carer_pay: bookingRow.sleep_in_carer_pay ?? null,
      }),
      seeker,
    };
    return NextResponse.json({ details: payload });
  }

  // ── kind === "open" ───────────────────────────────────────────
  const { data: reqRow } = await admin
    .from("service_requests")
    .select(
      "id, seeker_id, status, starts_at, ends_at, hours, hourly_rate_cents, currency, service_type, location_city, location_country, location_postcode, notes, expires_at",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      seeker_id: string;
      status: string;
      starts_at: string;
      ends_at: string;
      hours: number;
      hourly_rate_cents: number;
      currency: string;
      service_type: string;
      location_city: string | null;
      location_country: string | null;
      location_postcode: string | null;
      notes: string | null;
      expires_at: string;
    }>();
  if (!reqRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Open requests are visible pre-acceptance to any authenticated
  // carer in range. Don't leak rows from a seeker who blocked us etc.
  // The seeker themselves should never reach this kind of detail page.
  if (reqRow.seeker_id === user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [profRes, aggRes] = await Promise.all([
    admin
      .from("profiles")
      .select("full_name")
      .eq("id", reqRow.seeker_id)
      .maybeSingle<{ full_name: string | null }>(),
    admin.rpc("get_seeker_aggregates", { p_seeker_id: reqRow.seeker_id }),
  ]);
  const aggRow =
    Array.isArray(aggRes.data) && aggRes.data.length > 0
      ? (aggRes.data[0] as Aggregate)
      : null;
  const aggregate: Aggregate = aggRow ?? {
    rating_avg: null,
    rating_count: 0,
    completed_bookings: 0,
    last_completed_at: null,
  };
  const fn = firstName(profRes.data?.full_name ?? null);
  const initial = fn.slice(0, 1).toUpperCase();

  const payload: OpenDetails = {
    kind: "open",
    request: {
      id: reqRow.id,
      status: reqRow.status,
      starts_at: reqRow.starts_at,
      ends_at: reqRow.ends_at,
      hours: Number(reqRow.hours),
      hourly_rate_cents: reqRow.hourly_rate_cents,
      currency: reqRow.currency,
      service_type: reqRow.service_type,
      location_city: reqRow.location_city,
      location_country: reqRow.location_country,
      location_postcode_partial: partialPostcode(reqRow.location_postcode),
      expires_at: reqRow.expires_at,
      notes: reqRow.notes,
    },
    pay_breakdown: buildPayBreakdown({
      hours: Number(reqRow.hours),
      hourly_rate_cents: reqRow.hourly_rate_cents,
      currency: reqRow.currency,
      country: reqRow.location_country,
    }),
    seeker: {
      // Open requests show "S." style anonymised initial pre-claim.
      first_name: `${initial || "S"}.`,
      initial,
      aggregate,
      // We don't compute carer-specific repeat for open requests
      // because the carer hasn't been chosen yet.
      is_repeat: false,
    },
  };
  return NextResponse.json({ details: payload });
}
