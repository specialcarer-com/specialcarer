import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyFamilyOverview } from "@/lib/family/server";

export const dynamic = "force-dynamic";

/** GET /api/family/me → current user's family overview (auto-creates if missing). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const overview = await getMyFamilyOverview();
  if (!overview) {
    return NextResponse.json({ error: "No family found" }, { status: 404 });
  }
  return NextResponse.json({ overview });
}
