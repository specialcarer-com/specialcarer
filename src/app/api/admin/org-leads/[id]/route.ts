import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const STATUSES = new Set([
  "new",
  "contacted",
  "qualified",
  "disqualified",
  "converted",
]);

type Body = {
  status?: string;
  notes?: string;
  converted_to_org_id?: string;
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _adminGuard = await requireAdminApi();

  if (!_adminGuard.ok) return _adminGuard.response;
  const { id } = await params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (typeof body.status === "string") {
    if (!STATUSES.has(body.status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    update.status = body.status;
    if (body.status === "contacted") {
      update.contacted_at = new Date().toISOString();
    }
  }
  if (typeof body.notes === "string") {
    update.notes = body.notes.slice(0, 4000);
  }
  if (typeof body.converted_to_org_id === "string") {
    update.converted_to_org_id = body.converted_to_org_id;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("org_leads")
    .update(update)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
