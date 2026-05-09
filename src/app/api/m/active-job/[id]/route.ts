import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CARER_FEE_PERCENT,
  carerFeeCents,
  carerPayoutCents,
} from "@/lib/fees/config";
import { firstName } from "@/lib/jobs/sanitize";

export const dynamic = "force-dynamic";

type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
};

function safeChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (x): x is Record<string, unknown> =>
        typeof x === "object" && x != null,
    )
    .map((x) => ({
      id: typeof x.id === "string" ? x.id : crypto.randomUUID(),
      text: typeof x.text === "string" ? x.text : "",
      done: !!x.done,
      done_at: typeof x.done_at === "string" ? x.done_at : null,
      done_by: typeof x.done_by === "string" ? x.done_by : null,
    }))
    .filter((it) => it.text.length > 0);
}

/**
 * GET /api/m/active-job/[id]
 *
 * Live state for the carer's active-job screen. Returns:
 *   • booking (with full address fields revealed since carer is mid-shift)
 *   • recipients (full info — names, ages, allergies, instructions)
 *   • pay_breakdown (live: hours-so-far × rate)
 *   • checklist
 *   • recent_journal (last 5)
 *   • chat_unread_count
 *   • geofence config + service-point coords for the navigate button
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const admin = createAdminClient();

  const { data: bookingRaw } = await admin
    .from("bookings")
    .select(
      "id, seeker_id, caregiver_id, status, starts_at, ends_at, hours, hourly_rate_cents, subtotal_cents, currency, service_type, location_city, location_country, location_postcode, recipient_ids, notes, accepted_at, actual_started_at, shift_completed_at, checked_out_at, handoff_notes, arrival_selfie_path, photo_updates_consent, geofence_radius_m, task_checklist",
    )
    .eq("id", bookingId)
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
      actual_started_at: string | null;
      shift_completed_at: string | null;
      checked_out_at: string | null;
      handoff_notes: string | null;
      arrival_selfie_path: string | null;
      photo_updates_consent: boolean | null;
      geofence_radius_m: number | null;
      task_checklist: unknown;
    }>();
  if (!bookingRaw) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (bookingRaw.caregiver_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Service-point coords (best-effort).
  let lng: number | null = null;
  let lat: number | null = null;
  try {
    const { data: pt } = await admin.rpc("booking_service_point_lnglat", {
      p_booking_id: bookingId,
    });
    const row =
      Array.isArray(pt) && pt.length > 0
        ? (pt[0] as { lng: number; lat: number })
        : null;
    if (row && Number.isFinite(row.lng) && Number.isFinite(row.lat)) {
      lng = row.lng;
      lat = row.lat;
    }
  } catch {
    /* ignore */
  }

  // Recipients — full info post-accept (carer is on-shift).
  type RawRecipient = {
    id: string;
    kind: "child" | "senior" | "home";
    display_name: string | null;
    date_of_birth: string | null;
    allergies: string[] | null;
    medical_conditions: string[] | null;
    medications: unknown;
    mobility_level: string | null;
    special_needs: string[] | null;
    school: string | null;
    notes: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    postcode: string | null;
    has_pets: boolean | null;
    pets_notes: string | null;
    access_instructions: string | null;
  };
  let recipients: RawRecipient[] = [];
  const ids = (bookingRaw.recipient_ids ?? []).filter(
    (x): x is string => typeof x === "string",
  );
  if (ids.length > 0) {
    const { data: recRows } = await admin
      .from("household_recipients")
      .select(
        "id, kind, display_name, date_of_birth, allergies, medical_conditions, medications, mobility_level, special_needs, school, notes, address_line1, address_line2, city, postcode, has_pets, pets_notes, access_instructions",
      )
      .in("id", ids)
      .eq("owner_id", bookingRaw.seeker_id);
    recipients = ((recRows ?? []) as RawRecipient[]) ?? [];
  }

  // Pay breakdown (live). Uses hours-so-far if in_progress, else full
  // hours. Floored at 0, capped at booking.hours so the carer never
  // sees a > 100% number.
  const totalHours = Number(bookingRaw.hours);
  const startedMs = bookingRaw.actual_started_at
    ? new Date(bookingRaw.actual_started_at).getTime()
    : null;
  const completedMs = bookingRaw.shift_completed_at
    ? new Date(bookingRaw.shift_completed_at).getTime()
    : null;
  let hoursSoFar = 0;
  if (startedMs && bookingRaw.status === "in_progress") {
    hoursSoFar = Math.max(0, (Date.now() - startedMs) / 3600_000);
  } else if (startedMs && completedMs) {
    hoursSoFar = Math.max(0, (completedMs - startedMs) / 3600_000);
  }
  const cappedHours = Math.min(totalHours, hoursSoFar);
  const subtotalCents = Math.round(cappedHours * bookingRaw.hourly_rate_cents);
  const totalSubtotal =
    typeof bookingRaw.subtotal_cents === "number" && bookingRaw.subtotal_cents > 0
      ? bookingRaw.subtotal_cents
      : Math.round(totalHours * bookingRaw.hourly_rate_cents);
  const pay_breakdown_live = {
    hours_total: totalHours,
    hours_so_far: Math.round(cappedHours * 100) / 100,
    hourly_rate_cents: bookingRaw.hourly_rate_cents,
    subtotal_so_far_cents: subtotalCents,
    subtotal_total_cents: totalSubtotal,
    carer_fee_percent: CARER_FEE_PERCENT,
    carer_fee_cents: carerFeeCents(totalSubtotal),
    earnings_total_cents: carerPayoutCents(totalSubtotal),
    currency: bookingRaw.currency,
  };

  // Recent journal entries (last 5) for this booking — author + body
  // + photo paths. We expose photo paths as a fresh signed URL.
  const { data: journalRows } = await admin
    .from("care_journal_entries")
    .select("id, author_id, kind, body, photos, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(5);
  type JournalRow = {
    id: string;
    author_id: string;
    kind: string;
    body: string;
    photos: string[] | null;
    created_at: string;
  };
  const recent_journal = await Promise.all(
    ((journalRows ?? []) as JournalRow[]).map(async (e) => {
      const photo_urls: string[] = [];
      for (const p of e.photos ?? []) {
        try {
          const { data: signed } = await admin.storage
            .from("journal-photos")
            .createSignedUrl(p, 3600);
          if (signed?.signedUrl) photo_urls.push(signed.signedUrl);
        } catch {
          /* ignore */
        }
      }
      return {
        id: e.id,
        kind: e.kind,
        body: e.body,
        created_at: e.created_at,
        photo_urls,
      };
    }),
  );

  // Chat unread — best effort. If the messages table doesn't track
  // read receipts the way we expect, return 0 rather than failing.
  let chat_unread_count = 0;
  try {
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId)
      .eq("recipient_id", user.id)
      .is("read_at", null);
    chat_unread_count = count ?? 0;
  } catch {
    chat_unread_count = 0;
  }

  // Seeker first name + initial (already revealed for accepted bookings).
  const { data: prof } = await admin
    .from("profiles")
    .select("full_name, phone")
    .eq("id", bookingRaw.seeker_id)
    .maybeSingle<{ full_name: string | null; phone: string | null }>();
  const fn = firstName(prof?.full_name ?? null);

  return NextResponse.json({
    booking: {
      id: bookingRaw.id,
      status: bookingRaw.status,
      starts_at: bookingRaw.starts_at,
      ends_at: bookingRaw.ends_at,
      hours: totalHours,
      hourly_rate_cents: bookingRaw.hourly_rate_cents,
      currency: bookingRaw.currency,
      service_type: bookingRaw.service_type,
      location_city: bookingRaw.location_city,
      location_country: bookingRaw.location_country,
      location_postcode: bookingRaw.location_postcode,
      notes: bookingRaw.notes,
      accepted_at: bookingRaw.accepted_at,
      actual_started_at: bookingRaw.actual_started_at,
      shift_completed_at: bookingRaw.shift_completed_at,
      checked_out_at: bookingRaw.checked_out_at,
      handoff_notes: bookingRaw.handoff_notes,
      arrival_selfie_path: bookingRaw.arrival_selfie_path,
      photo_updates_consent: bookingRaw.photo_updates_consent,
      seeker_first_name: fn,
      seeker_initial: fn.slice(0, 1).toUpperCase(),
      seeker_phone: prof?.phone ?? null,
    },
    recipients_full: recipients,
    pay_breakdown_live,
    checklist: safeChecklist(bookingRaw.task_checklist),
    recent_journal,
    chat_unread_count,
    geofence: {
      radius_m: bookingRaw.geofence_radius_m ?? 200,
      service_point_lng: lng,
      service_point_lat: lat,
    },
  });
}
