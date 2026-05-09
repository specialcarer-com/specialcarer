import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AchievementRow = {
  achievement_key: string;
  earned: boolean;
  progress_current: number;
  progress_target: number;
  label: string;
  description: string;
};

/**
 * GET /api/carer-achievements/[id]
 * Returns earned achievements for a caregiver. Public endpoint —
 * the underlying view is derived from already-public stats.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("caregiver_achievements_v")
    .select(
      "achievement_key, earned, progress_current, progress_target, label, description",
    )
    .eq("caregiver_id", id)
    .eq("earned", true);
  if (error) {
    return NextResponse.json({ achievements: [] });
  }
  return NextResponse.json({
    achievements: (data ?? []) as AchievementRow[],
  });
}
