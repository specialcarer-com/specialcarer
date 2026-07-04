import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/auth";
import { ANOMALY_STATUSES } from "@/lib/ai/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/ai/anomalies?status=open
 * Admin-only listing across the anomaly queue view.
 */
export async function GET(req: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  let q = admin
    .from("ai_anomaly_queue_v")
    .select(
      "id, kind, severity, status, magnitude, details, detected_at, booking_id, booking_starts_at, booking_ends_at, booking_city, booking_status, caregiver_id, caregiver_name, seeker_id, seeker_name",
    )
    .order("detected_at", { ascending: false })
    .limit(500);
  if (status && (ANOMALY_STATUSES as readonly string[]).includes(status)) {
    q = q.eq("status", status);
  }
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}
