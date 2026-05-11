import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderOptInStartedEmail } from "@/lib/email/agency-optin-templates";
import { CURRENT_WORKER_B_VERSION } from "@/contracts";
import { isUkCarer } from "@/lib/agency-optin/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/agency-optin/start
 *
 * Carer-initiated. Transitions profile to `in_progress` (if currently
 * `not_started` or `rejected`), drafts a worker_b contract row if one
 * doesn't exist, and emails the carer.
 *
 * Idempotent: re-calling returns the existing draft state.
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
    return NextResponse.json(
      { error: "Only caregivers can opt in" },
      { status: 403 },
    );
  }
  if (!isUkCarer(profile.country)) {
    return NextResponse.json(
      { error: "Agency opt-in is available in UK only for now" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const status = profile.agency_opt_in_status as string;
  const isFresh = status === "not_started" || status === "rejected";

  if (isFresh) {
    const { error: updErr } = await admin
      .from("profiles")
      .update({
        agency_opt_in_status: "in_progress",
        agency_opt_in_started_at: now,
        agency_opt_in_rejected_reason: null,
      })
      .eq("id", user.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  // Idempotent draft of worker_b contract row.
  const { data: existing } = await admin
    .from("organization_contracts")
    .select("id, status, version")
    .eq("signed_by_user_id", user.id)
    .eq("contract_type", "worker_b")
    .eq("version", CURRENT_WORKER_B_VERSION)
    .maybeSingle<{ id: string; status: string; version: string }>();

  if (!existing) {
    const { error: insErr } = await admin.from("organization_contracts").insert({
      contract_type: "worker_b",
      version: CURRENT_WORKER_B_VERSION,
      markdown_path: `src/contracts/${CURRENT_WORKER_B_VERSION}.md`,
      status: "draft",
      signed_by_user_id: user.id,
      signature_method: "clickwrap",
    });
    if (insErr) {
      // Non-fatal; route is still useful even if draft insert fails.
      console.error("[agency-optin.start] draft contract insert failed", insErr);
    }
  }

  // Email — best-effort, do not block the response.
  if (isFresh) {
    const name = (profile.full_name ?? "").trim() || "there";
    const tpl = renderOptInStartedEmail({ name });
    if (user.email) {
      await sendEmail({
        to: user.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      }).catch((e) =>
        console.error("[agency-optin.start] email failed", e),
      );
    }
  }

  return NextResponse.json({ ok: true, status: "in_progress" });
}
