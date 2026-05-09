import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/training/[slug]/video-complete
 * Sets video_completed_at = now() if currently null. Creates the
 * enrollment first if it doesn't exist (so the carer can mark
 * watched on a fresh course visit without a separate /start call).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { data: course } = await supabase
    .from("training_courses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!course) {
    return NextResponse.json({ error: "course_not_found" }, { status: 404 });
  }

  // Ensure enrollment exists.
  let { data: enrollment } = await supabase
    .from("training_enrollments")
    .select("*")
    .eq("carer_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle();
  if (!enrollment) {
    const { data: created, error: insErr } = await supabase
      .from("training_enrollments")
      .insert({ carer_id: user.id, course_id: course.id })
      .select("*")
      .single();
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    enrollment = created;
  }

  if (!enrollment.video_completed_at) {
    const { data: updated, error: upErr } = await supabase
      .from("training_enrollments")
      .update({ video_completed_at: new Date().toISOString() })
      .eq("id", enrollment.id)
      .select("*")
      .single();
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    return NextResponse.json({ enrollment: updated });
  }
  return NextResponse.json({ enrollment });
}
