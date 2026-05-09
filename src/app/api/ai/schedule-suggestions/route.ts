import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveSuggestions } from "@/lib/ai/schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/ai/schedule-suggestions
 * Returns the active (pending, ≥0.5 confidence) suggestions for the
 * current seeker.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const suggestions = await getActiveSuggestions(user.id, 5);
  return NextResponse.json({ suggestions });
}
