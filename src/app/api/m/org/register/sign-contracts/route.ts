import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership } from "@/lib/org/server";
import {
  CURRENT_DPA_VERSION,
  CURRENT_MSA_VERSION,
} from "@/contracts";

export const dynamic = "force-dynamic";

type Body = {
  contract_versions?: { msa?: string; dpa?: string };
  signed_by_name?: string;
  signed_by_role?: string;
  comment?: string;
};

/**
 * POST /api/m/org/register/sign-contracts
 *
 * Records the org's clickwrap signatures of the current MSA + DPA.
 * Captures IP / user-agent for the audit trail. Idempotent: a fresh
 * call upserts the same row keyed (organization_id, contract_type,
 * version) so the user can re-confirm without erroring.
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

  const msaVersion = body.contract_versions?.msa ?? CURRENT_MSA_VERSION;
  const dpaVersion = body.contract_versions?.dpa ?? CURRENT_DPA_VERSION;
  if (msaVersion !== CURRENT_MSA_VERSION || dpaVersion !== CURRENT_DPA_VERSION) {
    return NextResponse.json(
      { error: "outdated_contract_version" },
      { status: 400 },
    );
  }
  const name = String(body.signed_by_name ?? "").trim();
  const role = String(body.signed_by_role ?? "").trim();
  if (name.length < 2 || role.length < 2) {
    return NextResponse.json(
      { error: "missing_signature_details" },
      { status: 400 },
    );
  }
  const comment =
    typeof body.comment === "string" && body.comment.trim()
      ? body.comment.trim().slice(0, 4000)
      : null;

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) {
    return NextResponse.json({ error: "no_org" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ua = req.headers.get("user-agent")?.slice(0, 240) ?? null;
  const now = new Date().toISOString();

  // Look up the organization_members.id for the signing user — we
  // store this on every contract row for the audit trail.
  const { data: memberRow } = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", member.organization_id)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string }>();
  const memberId: string | null = memberRow?.id ?? null;

  const baseRow = {
    organization_id: member.organization_id,
    status: "signed",
    signed_by_member_id: memberId,
    signed_by_name: name,
    signed_by_role: role,
    signed_at: now,
    signature_ip: ip,
    signature_user_agent: ua,
    signature_method: "clickwrap",
    legal_review_comment: comment,
  };
  const rows = [
    {
      ...baseRow,
      contract_type: "msa",
      version: msaVersion,
      markdown_path: `src/contracts/${msaVersion}.md`,
    },
    {
      ...baseRow,
      contract_type: "dpa",
      version: dpaVersion,
      markdown_path: `src/contracts/${dpaVersion}.md`,
    },
  ];

  const { error } = await admin
    .from("organization_contracts")
    .upsert(rows, {
      onConflict: "organization_id,contract_type,version",
    });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    msa_version: msaVersion,
    dpa_version: dpaVersion,
  });
}
