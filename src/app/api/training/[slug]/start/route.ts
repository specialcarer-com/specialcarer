import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/training/[slug]/start
 * Idempotent — if the enrollment already exists, returns it
 * unchanged. Otherwise creates one with started_at = now().
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

  const { data: course, error: cErr } = await supabase
    .from("training_courses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (cErr || !course) {
    return NextResponse.json({ error: "course_not_found" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("training_enrollments")
    .select("*")
    .eq("carer_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ enrollment: existing });
  }

  const { data: created, error: insErr } = await supabase
    .from("training_enrollments")
    .insert({ carer_id: user.id, course_id: course.id })
    .select("*")
    .single();
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ enrollment: created });
}
