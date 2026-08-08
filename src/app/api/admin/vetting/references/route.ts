import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateReferenceVerifyGuard } from "@/lib/vetting/reference-cqc";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  id: z.string().trim().min(1),
  action: z.enum(["verify", "reject"]),
  reason: z.string().trim().max(500).optional(),
  admin_notes: z.string().trim().max(1000).optional(),
});

export async function POST(req: Request) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_args" }, { status: 400 });
  }
  const body = parsed.data;
  const admin = createAdminClient();
  const adminNotes = body.admin_notes ?? "";
  if (body.action === "verify") {
    const { data: reference, error: referenceError } = await admin
      .from("carer_references")
      .select("safeguarding_dbs")
      .eq("id", body.id)
      .maybeSingle<{ safeguarding_dbs: string | null }>();
    if (referenceError) {
      return NextResponse.json(
        { error: referenceError.message },
        { status: 500 },
      );
    }
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
  const update: Record<string, unknown> = {};
  if (typeof body.admin_notes === "string") {
    update.admin_notes = adminNotes || null;
  }
  if (body.action === "verify") {
    update.status = "verified";
    update.verified_by = me.id;
    update.verified_at = new Date().toISOString();
    update.rejected_reason = null;
  } else {
    update.status = "rejected";
    update.rejected_reason =
      body.reason || null;
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
