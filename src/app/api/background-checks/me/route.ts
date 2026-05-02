import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/background-checks/me
 *
 * Returns the current caller's background-check status across all check types
 * plus an aggregate `cleared` boolean. Country-aware (GB → uCheck bundle,
 * US → Checkr bundle).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("country")
    .eq("id", user.id)
    .maybeSingle();
  const country = (profile?.country as "GB" | "US") || "GB";

  const { data: rows } = await supabase
    .from("background_checks")
    .select(
      "id, vendor, check_type, status, invite_url, issued_at, expires_at, updated_at"
    )
    .eq("user_id", user.id);

  const required =
    country === "US"
      ? ["us_criminal", "us_healthcare_sanctions"]
      : ["enhanced_dbs_barred", "right_to_work", "digital_id"];

  const list = rows ?? [];
  const allCleared = required.every((t) =>
    list.some((r) => r.check_type === t && r.status === "cleared")
  );

  return NextResponse.json({
    country,
    cleared: allCleared,
    required,
    checks: list,
  });
}
