/**
 * POST /api/admin/bookings/[id]/geofence-override
 *
 * Ops-only auditable exception path for the HARD 50 m geofence (Sprint 4.5 v2).
 * When a carer is legitimately at the client but the geofence fails (bad
 * geocode, GPS drift, flat with a weak fix), an admin records the clock_in here
 * with `geofence_status = 'override'` and a mandatory reason. NOT exposed on the
 * carer app — exercised via the admin console or curl.
 *
 * Body: {
 *   event_type: "clock_in",
 *   latitude, longitude, accuracy_metres,
 *   client_reported_at, notes?, reason
 * }
 *
 * Responses:
 *  - 201 { event }                    — the inserted override event
 *  - 400 { error }                    — invalid body / reason too short / not clock_in
 *  - 401 { ok:false, error }          — unauthenticated (from requireAdminApi)
 *  - 403 { error:"Forbidden" }        — not an admin
 *  - 404 { error:"visit not found" }  — no such booking
 *  - 428 { error }                    — admin MFA setup/challenge required
 *  - 500 { error:"override_failed" }  — unexpected server/DB error
 *
 * The pure decision logic lives in ./override-handler; this file is the boundary
 * (admin auth, DB wiring, audit log).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import type { VisitEventRow } from "@/app/api/bookings/[id]/clock/clock-handler";
import {
  handleGeofenceOverride,
  type OverrideClient,
  type OverrideInsertRow,
} from "./override-handler";

export const dynamic = "force-dynamic";

const EVENT_COLS =
  "id, visit_id, carer_id, event_type, event_at, latitude, longitude, accuracy_metres, client_reported_at, server_recorded_at, device_info, notes, photo_url, photo_verification_status, photo_similarity_score, photo_verification_checked_at, geofence_status, distance_from_client_metres, admin_override_by, admin_override_reason, admin_override_at, verified_by_admin_id, created_at";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: visitId } = await params;

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const db = createAdminClient();
  const client: OverrideClient = {
    async getBooking(id) {
      return db
        .from("bookings")
        .select("id, caregiver_id")
        .eq("id", id)
        .maybeSingle<{ id: string; caregiver_id: string | null }>();
    },
    async getClientCoords(id) {
      const { data, error } = await db
        .rpc("booking_service_point_lnglat", { p_booking_id: id })
        .returns<{ lng: number; lat: number }[]>();
      if (error) return { data: null, error };
      const row = Array.isArray(data) ? data[0] : null;
      const coords =
        row && Number.isFinite(row.lat) && Number.isFinite(row.lng)
          ? { lat: Number(row.lat), lng: Number(row.lng) }
          : null;
      return { data: coords, error: null };
    },
    async insertOverrideEvent(row: OverrideInsertRow) {
      return db
        .from("visit_events")
        .insert({
          ...row,
          event_type: "clock_in",
          device_info: { source: "admin_geofence_override" },
          geofence_status: "override",
        })
        .select(EVENT_COLS)
        .single<VisitEventRow>();
    },
  };

  const result = await handleGeofenceOverride({
    visitId,
    adminId: admin.id,
    body,
    client,
  });

  if (result.audit) {
    await logAdminAction({
      admin,
      action: "visit_geofence_override",
      targetType: "visit_event",
      targetId: result.audit.eventId,
      details: {
        booking_id: visitId,
        distance_from_client_metres: result.audit.distanceMetres,
        reason: result.audit.reason,
      },
    });
  }

  return NextResponse.json(result.body, { status: result.status });
}
