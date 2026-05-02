import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/background-checks/me
 *
 * Returns the current caller's background-check status across all check types
 * plus an aggregate `cleared` boolean.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: rows } = await supabase
    .from("background_checks")
    .select(
      "id, vendor, check_type, status, invite_url, issued_at, expires_at, updated_at"
    )
    .eq("user_id", user.id);

  const ukRequired = ["enhanced_dbs_barred", "right_to_work", "digital_id"];
  const list = rows ?? [];
  const allClearedUK =
    ukRequired.every((t) =>
      list.some((r) => r.check_type === t && r.status === "cleared")
    );

  return NextResponse.json({
    cleared: allClearedUK,
    required: ukRequired,
    checks: list,
  });
}
