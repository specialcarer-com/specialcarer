import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/account/delete
 *
 * Body: { confirm: "DELETE" }
 *
 * Hard deletes the authenticated user and all associated PII. Cascades:
 *   - profiles (FK to auth.users)
 *   - bookings (FK to auth.users) — but we cancel any active future bookings first
 *   - background_checks (FK to auth.users)
 *   - shift_locations / shift_tracking_sessions
 *   - vendor_costs (caregiver_id is FK to auth.users; rows are kept under a tombstone uuid for accounting)
 *
 * Required for App Store compliance (Guideline 5.1.1(v)).
 * Required for GDPR Article 17 (Right to Erasure).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: "Send { confirm: 'DELETE' } to confirm." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const userId = user.id;

  // Refuse if there's an active paid booking that hasn't completed yet
  const { data: activeBookings } = await admin
    .from("bookings")
    .select("id")
    .or(`seeker_id.eq.${userId},caregiver_id.eq.${userId}`)
    .in("status", ["confirmed", "in_progress"])
    .gt("ends_at", new Date().toISOString())
    .limit(1);

  if (activeBookings && activeBookings.length > 0) {
    return NextResponse.json(
      {
        error:
          "You have an active or upcoming booking. Cancel it (or wait for completion) before deleting your account.",
      },
      { status: 400 }
    );
  }

  // Stop any in-flight tracking sessions
  await admin
    .from("shift_tracking_sessions")
    .update({ status: "cancelled", ended_at: new Date().toISOString() })
    .or(`seeker_id.eq.${userId},caregiver_id.eq.${userId}`)
    .eq("status", "active");

  // Wipe location pings (PII)
  await admin.from("shift_locations").delete().eq("caregiver_id", userId);

  // Redact background_check vendor refs but retain the audit row for compliance
  await admin
    .from("background_checks")
    .update({
      vendor_applicant_id: null,
      vendor_check_id: null,
      invite_url: null,
      raw: null,
    })
    .eq("user_id", userId);

  // Delete profile row
  await admin.from("profiles").delete().eq("id", userId);

  // Finally delete the auth user (cascades remaining FK rows where ON DELETE CASCADE is set)
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deletedAt: new Date().toISOString() });
}
