import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, type AdminUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

type Decision = "approved" | "rejected" | "requested_more_info";

/**
 * POST /api/admin/kyc/[backgroundCheckId]/decide
 * Body: { decision: "approved" | "rejected" | "requested_more_info", notes: string }
 *
 * Writes to kyc_escalations (one row per decision).
 * If decision === "approved", flips background_checks.status → "cleared".
 * Audit-logs kyc.decision.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ backgroundCheckId: string }> },
) {
  const { backgroundCheckId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminUser: AdminUser = { id: user.id, email: user.email ?? null };

  const body = (await req.json().catch(() => ({}))) as {
    decision?: string;
    notes?: string;
  };
  const decision = body.decision as Decision | undefined;
  const notes = (body.notes ?? "").trim();
  if (
    decision !== "approved" &&
    decision !== "rejected" &&
    decision !== "requested_more_info"
  ) {
    return NextResponse.json(
      {
        error:
          'decision must be "approved", "rejected", or "requested_more_info"',
      },
      { status: 400 },
    );
  }
  if (!notes) {
    return NextResponse.json({ error: "Notes are required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: bg } = await admin
    .from("background_checks")
    .select("id, user_id, vendor, check_type, status, result_summary")
    .eq("id", backgroundCheckId)
    .maybeSingle();
  if (!bg) {
    return NextResponse.json(
      { error: "Background check not found" },
      { status: 404 },
    );
  }

  // Insert decision row (UNIQUE on background_check_id → upsert via insert + onConflict)
  const { error: insErr } = await admin.from("kyc_escalations").upsert(
    {
      background_check_id: bg.id,
      user_id: bg.user_id,
      decision,
      decided_by: user.id,
      decided_by_email: user.email ?? null,
      notes,
    },
    { onConflict: "background_check_id" },
  );
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // If approved, flip the background_check status to cleared so the user can proceed.
  if (decision === "approved") {
    await admin
      .from("background_checks")
      .update({ status: "cleared" })
      .eq("id", bg.id);
  }

  await logAdminAction({
    admin: adminUser,
    action: "kyc.decision",
    targetType: "background_check",
    targetId: bg.id,
    details: {
      user_id: bg.user_id,
      vendor: bg.vendor,
      check_type: bg.check_type,
      prior_status: bg.status,
      decision,
      notes,
    },
  });

  return NextResponse.json({ ok: true, decision });
}
