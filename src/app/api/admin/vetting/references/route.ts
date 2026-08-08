import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateReferenceVerifyGuard } from "@/lib/vetting/reference-cqc";

export const dynamic = "force-dynamic";

type Body = {
  id?: string;
  action?: "verify" | "reject";
  reason?: string;
  admin_notes?: string;
};

export async function POST(req: Request) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id || (body.action !== "verify" && body.action !== "reject")) {
    return NextResponse.json({ error: "invalid_args" }, { status: 400 });
  }
  const admin = createAdminClient();
  const adminNotes =
    typeof body.admin_notes === "string" ? body.admin_notes.trim() : "";
  if (adminNotes.length > 1000) {
    return NextResponse.json({ error: "admin_notes_too_long" }, { status: 400 });
  }
  if (body.action === "verify") {
    const { data: reference } = await admin
      .from("carer_references")
      .select("safeguarding_dbs")
      .eq("id", body.id)
      .maybeSingle<{ safeguarding_dbs: string | null }>();
    if (!reference) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const guardError = validateReferenceVerifyGuard({
      safeguardingDbs: reference.safeguarding_dbs,
      adminNotes,
    });
    if (guardError) {
      return NextResponse.json(
        { error: guardError },
        { status: 400 },
      );
    }
  }
  const update: Record<string, unknown> = {
    verified_by: me.id,
    verified_at: new Date().toISOString(),
    admin_notes: adminNotes || null,
  };
  if (body.action === "verify") {
    update.status = "verified";
    update.rejected_reason = null;
  } else {
    update.status = "rejected";
    update.rejected_reason =
      typeof body.reason === "string" ? body.reason.slice(0, 500) : null;
  }
  const { error } = await admin
    .from("carer_references")
    .update(update)
    .eq("id", body.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
