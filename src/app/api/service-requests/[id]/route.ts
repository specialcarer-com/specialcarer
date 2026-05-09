import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/service-requests/[id] — owner cancels their own open
 * request. Sets status='cancelled' rather than physically deleting so
 * the audit trail stays.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("service_requests")
    .select("seeker_id, status")
    .eq("id", id)
    .maybeSingle<{ seeker_id: string; status: string }>();
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (row.seeker_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (row.status !== "open") {
    return NextResponse.json(
      { error: `cannot_cancel_${row.status}` },
      { status: 400 },
    );
  }
  const { error } = await admin
    .from("service_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
