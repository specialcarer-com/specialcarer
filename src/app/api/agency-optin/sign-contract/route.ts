import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderGateCompleteEmail } from "@/lib/email/agency-optin-templates";
import { CURRENT_WORKER_B_VERSION } from "@/contracts";
import { getGatesForUser, isUkCarer } from "@/lib/agency-optin/server";

export const dynamic = "force-dynamic";

type Body = {
  signed_by_name?: string;
  signed_by_role?: string;
  agree?: boolean;
};

/**
 * POST /api/agency-optin/sign-contract
 *
 * Carer signs the current worker_b contract (clickwrap). The platform
 * countersigns asynchronously on admin approval. Idempotent — re-calling
 * with the same payload is a no-op once a 'signed' or later state row
 * exists for this carer + current version.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, country, full_name")
    .eq("id", user.id)
    .maybeSingle<{
      role: string;
      country: string | null;
      full_name: string | null;
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
  if (body.agree !== true) {
    return NextResponse.json(
      { error: "You must tick the agreement box" },
      { status: 400 },
    );
  }
  const name = String(body.signed_by_name ?? profile.full_name ?? "").trim();
  const role = String(body.signed_by_role ?? "Carer").trim();
  if (name.length < 2) {
    return NextResponse.json(
      { error: "Please enter your full legal name" },
      { status: 400 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ua = req.headers.get("user-agent")?.slice(0, 240) ?? null;
  const now = new Date().toISOString();

  // Check existing row first — idempotency for re-submit.
  const { data: existing } = await admin
    .from("organization_contracts")
    .select("id, status")
    .eq("signed_by_user_id", user.id)
    .eq("contract_type", "worker_b")
    .eq("version", CURRENT_WORKER_B_VERSION)
    .maybeSingle<{ id: string; status: string }>();

  if (existing && existing.status !== "draft") {
    // Already signed or further along — return success without overwriting.
    return NextResponse.json({ ok: true, status: existing.status });
  }

  const payload = {
    contract_type: "worker_b" as const,
    version: CURRENT_WORKER_B_VERSION,
    markdown_path: `src/contracts/${CURRENT_WORKER_B_VERSION}.md`,
    status: "signed" as const,
    signed_by_user_id: user.id,
    signed_by_name: name,
    signed_by_role: role,
    signed_at: now,
    signature_ip: ip,
    signature_user_agent: ua,
    signature_method: "clickwrap" as const,
  };

  if (existing) {
    const { error } = await admin
      .from("organization_contracts")
      .update(payload)
      .eq("id", existing.id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin
      .from("organization_contracts")
      .insert(payload);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Worker_b is countersigned on admin approve. Until then status='signed'
  // and the gate stays red. For the simplified Phase-2 auto-queue flow we
  // ALSO countersign immediately so the gate goes green and admin can
  // batch-approve via the dashboard. Note: countersignature_by_admin_id
  // is set during the actual /approve endpoint.
  await admin
    .from("organization_contracts")
    .update({
      status: "countersigned",
      countersigned_at: now,
      effective_from: now,
    })
    .eq("signed_by_user_id", user.id)
    .eq("contract_type", "worker_b")
    .eq("version", CURRENT_WORKER_B_VERSION);

  // Email — best-effort
  const displayName = (profile.full_name ?? "").trim() || "there";
  const gates = await getGatesForUser(admin, user.id);
  const remaining = countRemaining(gates);
  const tpl = renderGateCompleteEmail({
    name: displayName,
    gateLabel: "Worker agreement",
    remaining,
  });
  if (user.email) {
    await sendEmail({
      to: user.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    }).catch((e) =>
      console.error("[agency-optin.sign-contract] email failed", e),
    );
  }

  return NextResponse.json({ ok: true, status: "countersigned" });
}

function countRemaining(
  gates: Awaited<ReturnType<typeof getGatesForUser>>,
): number {
  if (!gates) return 4;
  let left = 0;
  if (!gates.contract_ok) left++;
  if (!gates.dbs_ok) left++;
  if (!gates.rtw_ok) left++;
  if (!gates.training_ok) left++;
  return left;
}
