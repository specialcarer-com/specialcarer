/**
 * GET /api/bookings/[id]/events
 *
 * Returns the visit's clock-in/out events in chronological order (Sprint 4.5).
 *
 * Gated with the same access rule as the visit_events RLS policies: the
 * booking's assigned carer, the seeker/family who owns the visit, or an admin.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VisitEventRow } from "../clock/clock-handler";

export const dynamic = "force-dynamic";

const EVENT_COLS =
  "id, visit_id, carer_id, event_type, event_at, latitude, longitude, accuracy_metres, client_reported_at, server_recorded_at, device_info, notes, photo_url, created_at";

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
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, seeker_id, caregiver_id")
    .eq("id", visitId)
    .maybeSingle<{ id: string; seeker_id: string; caregiver_id: string | null }>();
  if (!booking) {
    return NextResponse.json({ error: "visit not found" }, { status: 404 });
  }

  const isParty =
    booking.seeker_id === user.id || booking.caregiver_id === user.id;
  let allowed = isParty;
  if (!allowed) {
    const { data: prof } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: string | null }>();
    allowed = prof?.role === "admin";
  }
  if (!allowed) {
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

  return NextResponse.json({ events: events ?? [] });
}
