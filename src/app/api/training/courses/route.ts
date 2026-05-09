import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TrainingCourse, TrainingEnrollment } from "@/lib/training/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/training/courses
 * Returns all published courses plus the current user's enrollment
 * (or null) for each. Anonymous callers get every course with
 * enrollment=null.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: courses, error: cErr } = await supabase
    .from("training_courses")
    .select(
      "id, slug, title, summary, category, is_required, ceu_credits, video_url, video_provider, transcript_md, duration_minutes, country_scope, required_for_verticals, sort_order",
    )
    .order("sort_order", { ascending: true });
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const list = (courses ?? []) as TrainingCourse[];
  let enrollmentByCourse = new Map<string, TrainingEnrollment>();
  if (user) {
    const { data: enrollments } = await supabase
      .from("training_enrollments")
      .select(
        "id, carer_id, course_id, started_at, video_completed_at, quiz_passed_at, quiz_best_score, attempts, certificate_url, ceu_credits_awarded, verification_code",
      )
      .eq("carer_id", user.id);
    enrollmentByCourse = new Map(
      ((enrollments ?? []) as TrainingEnrollment[]).map((e) => [
        e.course_id,
        e,
      ]),
    );
  }

  return NextResponse.json({
    courses: list.map((c) => ({
      ...c,
      enrollment: enrollmentByCourse.get(c.id) ?? null,
    })),
  });
}
