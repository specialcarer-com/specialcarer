import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/m/timeoff/[id] — cancel a pending time-off request
 * Sets status to 'cancelled' (soft delete — keeps the record).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Only allow cancelling own pending requests
  const { data: existing } = await supabase
    .from("caregiver_timeoff_requests")
    .select("id, status, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending requests can be cancelled" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("caregiver_timeoff_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
