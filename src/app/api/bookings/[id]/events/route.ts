/**
 * GET /api/bookings/[id]/events
 *
 * Returns the visit's clock-in/out events in chronological order (Sprint 4.5).
 *
 * Gated with the same access rule as the visit_events RLS policies: the
 * booking's assigned carer, the seeker/family who owns the visit, or an admin.
 *
 * The response is shaped by the requester's role: the ops-internal verification
 * fields (similarity score, override attribution/reason, reviewer id, raw
 * coordinates) are ONLY returned to admins. Carers get the operational subset
 * they need to render their own clock card; families get just the visit
 * timeline. This keeps admin-only PII off the shared endpoint.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VisitEventRow } from "../clock/clock-handler";
import { shapeEvent, type Role } from "./shape";

export const dynamic = "force-dynamic";

const EVENT_COLS =
  "id, visit_id, carer_id, event_type, event_at, latitude, longitude, accuracy_metres, client_reported_at, server_recorded_at, device_info, notes, photo_url, photo_verification_status, photo_similarity_score, photo_verification_checked_at, geofence_status, distance_from_client_metres, admin_override_by, admin_override_reason, admin_override_at, verified_by_admin_id, created_at";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: visitId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("id, seeker_id, caregiver_id")
    .eq("id", visitId)
    .maybeSingle<{ id: string; seeker_id: string; caregiver_id: string | null }>();
  if (bookingErr) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "visit not found" }, { status: 404 });
  }

  // Resolve the requester's role. Admin status is authoritative even for a user
  // who also happens to be a party, so check the profile role first.
  const { data: prof, error: profErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null }>();
  if (profErr) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  let role: Role | null = null;
  if (prof?.role === "admin") {
    role = "admin";
  } else if (booking.caregiver_id === user.id) {
    role = "carer";
  } else if (booking.seeker_id === user.id) {
    role = "family";
  }
  if (!role) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: events, error } = await admin
    .from("visit_events")
    .select(EVENT_COLS)
    .eq("visit_id", visitId)
    .order("event_at", { ascending: true })
    .returns<VisitEventRow[]>();
  if (error) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const shaped = (events ?? []).map((e) => shapeEvent(e, role));
  return NextResponse.json({ events: shaped });
}
