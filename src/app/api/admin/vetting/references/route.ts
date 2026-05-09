import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Body = {
  id?: string;
  action?: "verify" | "reject";
  reason?: string;
};

export async function POST(req: Request) {
  const me = await requireAdmin();
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
  const update: Record<string, unknown> = {
    verified_by: me.id,
    verified_at: new Date().toISOString(),
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
