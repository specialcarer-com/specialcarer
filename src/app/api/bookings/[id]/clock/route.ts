/**
 * POST /api/bookings/[id]/clock
 *
 * Carer records a GPS clock-in / clock-out against a visit (Sprint 4.5).
 * Body: { event_type, latitude, longitude, accuracy_metres, client_reported_at, notes? }
 *
 * Auth: caller must be the booking's assigned carer. Checked here for a clean
 * 403 and again inside the pure handler against the service-role read. Writes
 * go through the service-role client (RLS on visit_events is defence in depth).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleClock,
  type ClockClient,
  type ClockBookingRow,
  type ClockEventType,
  type VisitEventRow,
} from "./clock-handler";

export const dynamic = "force-dynamic";

const EVENT_COLS =
  "id, visit_id, carer_id, event_type, event_at, latitude, longitude, accuracy_metres, client_reported_at, server_recorded_at, device_info, notes, photo_url, created_at";

export async function POST(
  req: Request,
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const client: ClockClient = {
    async getBooking(id) {
      const { data, error } = await admin
        .from("bookings")
        .select("id, caregiver_id, status")
        .eq("id", id)
        .maybeSingle<ClockBookingRow>();
      if (error) throw new Error(`booking read failed: ${error.message}`);
      return data ?? null;
    },
    async latestEvent(id) {
      const { data, error } = await admin
        .from("visit_events")
        .select(EVENT_COLS)
        .eq("visit_id", id)
        .order("event_at", { ascending: false })
        .limit(1)
        .maybeSingle<VisitEventRow>();
      if (error) throw new Error(`visit_events read failed: ${error.message}`);
      return data ?? null;
    },
    async insertEvent(row) {
      const { data, error } = await admin
        .from("visit_events")
        .insert(row)
        .select(EVENT_COLS)
        .single<VisitEventRow>();
      if (error || !data) {
        throw new Error(error?.message ?? "insert failed");
      }
      return data;
    },
  };

  const deviceInfo = {
    user_agent: req.headers.get("user-agent"),
    platform: req.headers.get("sec-ch-ua-platform"),
    app_version: req.headers.get("x-app-version"),
  };

  try {
    const result = await handleClock(client, {
      visitId,
      carerId: user.id,
      body,
      deviceInfo,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "clock_failed";
    console.error("[clock] insert failed", msg);
    return NextResponse.json({ error: "clock_failed" }, { status: 500 });
  }
}

export type { ClockEventType };
