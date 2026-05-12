import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/me/favourites/[carer_id] — unsave (idempotent).
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ carer_id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { carer_id } = await ctx.params;
  const carerId = (carer_id ?? "").trim();
  if (!carerId) {
    return NextResponse.json({ error: "Missing carer_id" }, { status: 400 });
  }
  const { error } = await supabase
    .from("saved_caregivers")
    .delete()
    .eq("seeker_id", user.id)
    .eq("caregiver_id", carerId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ saved: false });
}
