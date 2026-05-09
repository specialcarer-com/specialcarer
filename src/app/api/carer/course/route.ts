import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COURSE_MODULES } from "@/lib/vetting/course-content";

export const dynamic = "force-dynamic";

/**
 * GET /api/carer/course
 * Returns the modules (without correctIndex) and the carer's progress.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: progressRows } = await supabase
    .from("carer_course_progress")
    .select("module_key, read_at, knowledge_check_correct, knowledge_check_attempted_at")
    .eq("carer_id", user.id);
  const byKey = new Map(
    ((progressRows ?? []) as {
      module_key: string;
      read_at: string | null;
      knowledge_check_correct: boolean | null;
      knowledge_check_attempted_at: string | null;
    }[]).map((r) => [r.module_key, r]),
  );

  const modules = COURSE_MODULES.map((m) => ({
    key: m.key,
    title: m.title,
    summary: m.summary,
    progress: {
      read_at: byKey.get(m.key)?.read_at ?? null,
      knowledge_check_correct:
        byKey.get(m.key)?.knowledge_check_correct ?? null,
      knowledge_check_attempted_at:
        byKey.get(m.key)?.knowledge_check_attempted_at ?? null,
    },
  }));
  return NextResponse.json({ modules });
}
