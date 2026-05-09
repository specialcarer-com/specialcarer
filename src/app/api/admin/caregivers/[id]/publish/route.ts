import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, type AdminUser } from "@/lib/admin/auth";
import { getVettingSummary } from "@/lib/vetting/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/caregivers/[id]/publish
 * Body: { action: "publish" | "unpublish", reason?: string }
 *
 * Admin-only. Toggles caregiver_profiles.is_published and writes an
 * admin_audit_log row with a snapshot of the readiness state at the time
 * of the action (so post-hoc review can see whether blockers were overridden).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

  // --- Auth: must be admin ---
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const adminUser: AdminUser = { id: user.id, email: user.email ?? null };

  // --- Body ---
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
  };
  const action = body.action;
  if (action !== "publish" && action !== "unpublish") {
    return NextResponse.json(
      { error: 'action must be "publish" or "unpublish"' },
      { status: 400 },
    );
  }
  const reason = (body.reason ?? "").trim() || null;

  // --- Load profile + readiness snapshot ---
  const admin = createAdminClient();
  const { data: cg } = await admin
    .from("caregiver_profiles")
    .select(
      "user_id, display_name, country, is_published, hourly_rate_cents, currency",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (!cg) {
    return NextResponse.json(
      { error: "Caregiver profile not found" },
      { status: 404 },
    );
  }

  // Snapshot readiness at action time
  const required =
    cg.country === "US"
      ? ["us_criminal", "us_healthcare_sanctions"]
      : ["enhanced_dbs_barred", "right_to_work", "digital_id"];
  const [stripeRes, bgRes] = await Promise.all([
    admin
      .from("caregiver_stripe_accounts")
      .select("charges_enabled, payouts_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("background_checks")
      .select("check_type, status")
      .eq("user_id", userId),
  ]);
  const cleared = new Set(
    (bgRes.data ?? [])
      .filter((b) => b.status === "cleared")
      .map((b) => b.check_type as string),
  );
  const missing = required.filter((r) => !cleared.has(r));
  const payoutsEnabled = !!stripeRes.data?.payouts_enabled;
  const blockers: string[] = [];
  if (!payoutsEnabled) blockers.push("Stripe payouts not enabled");
  if (missing.length > 0) blockers.push(`Missing checks: ${missing.join(", ")}`);

  // Vetting v1 readiness — soft warn (admin can still override with a
  // reason, but the gaps land in the audit log so we can see exactly
  // what was overridden later).
  const vetting = await getVettingSummary(admin, userId);
  if (!vetting.references.complete) {
    blockers.push(
      `References incomplete (${vetting.references.verified}/3 verified)`,
    );
  }
  if (vetting.certifications.verified === 0) {
    blockers.push("No certifications verified");
  }
  if (!vetting.skills.has_any_pass) {
    blockers.push("No skills quiz passed");
  }
  if (!vetting.interview.complete) {
    blockers.push(
      `Interview incomplete (${vetting.interview.approved}/${vetting.interview.required})`,
    );
  }
  if (!vetting.course.complete) {
    blockers.push(
      `Onboarding course incomplete (${vetting.course.completed_modules}/${vetting.course.total})`,
    );
  }

  const ready = blockers.length === 0;

  // --- Apply update ---
  const newPublished = action === "publish";
  if (cg.is_published === newPublished) {
    return NextResponse.json(
      { ok: true, status: "noop", is_published: newPublished },
      { status: 200 },
    );
  }

  const overrode = action === "publish" && !ready;

  // Override-publishing requires a reason
  if (overrode && !reason) {
    return NextResponse.json(
      { error: "Reason is required when publishing with blockers." },
      { status: 400 },
    );
  }
  // Unpublishing also requires a reason (defence against accidental click)
  if (action === "unpublish" && !reason) {
    return NextResponse.json(
      { error: "Reason is required when unpublishing." },
      { status: 400 },
    );
  }

  const { error: updErr } = await admin
    .from("caregiver_profiles")
    .update({
      is_published: newPublished,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await logAdminAction({
    admin: adminUser,
    action: action === "publish" ? "caregiver.publish" : "caregiver.unpublish",
    targetType: "caregiver_profile",
    targetId: userId,
    details: {
      display_name: cg.display_name,
      country: cg.country,
      override: overrode,
      ready,
      blockers,
      payouts_enabled: payoutsEnabled,
      bg_required: required,
      bg_cleared: Array.from(cleared),
      bg_missing: missing,
      vetting,
      reason,
    },
  });

  return NextResponse.json({
    ok: true,
    is_published: newPublished,
    override: overrode,
  });
}
