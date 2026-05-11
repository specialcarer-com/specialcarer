import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderOptInSubmittedEmail } from "@/lib/email/agency-optin-templates";
import { getGatesForUser, isUkCarer } from "@/lib/agency-optin/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/agency-optin/submit
 *
 * Carer submits for admin review. Validates all four gates are green
 * via v_agency_opt_in_gates and transitions status to ready_for_review.
 * Idempotent: re-submit while already in ready_for_review or active is
 * a no-op success.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, country, full_name, agency_opt_in_status")
    .eq("id", user.id)
    .maybeSingle<{
      role: string;
      country: string | null;
      full_name: string | null;
      agency_opt_in_status: string;
    }>();
  if (!profile || profile.role !== "caregiver") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isUkCarer(profile.country)) {
    return NextResponse.json(
      { error: "Agency opt-in is available in UK only for now" },
      { status: 400 },
    );
  }
  if (
    profile.agency_opt_in_status === "ready_for_review" ||
    profile.agency_opt_in_status === "active"
  ) {
    return NextResponse.json({
      ok: true,
      status: profile.agency_opt_in_status,
    });
  }

  const gates = await getGatesForUser(admin, user.id);
  if (!gates?.overall_ready) {
    return NextResponse.json(
      { error: "Not all gates are green yet", gates },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("profiles")
    .update({
      agency_opt_in_status: "ready_for_review",
      agency_opt_in_submitted_at: now,
    })
    .eq("id", user.id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const name = (profile.full_name ?? "").trim() || "there";
  const tpl = renderOptInSubmittedEmail({ name });
  if (user.email) {
    await sendEmail({
      to: user.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    }).catch((e) =>
      console.error("[agency-optin.submit] email failed", e),
    );
  }

  return NextResponse.json({ ok: true, status: "ready_for_review" });
}
