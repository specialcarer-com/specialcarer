import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCoursePatch } from "@/lib/admin/training-validation";

export const dynamic = "force-dynamic";

/** GET /api/admin/training/courses/[id] — course + ordered quiz questions. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const admin = createAdminClient();

  const { data: course, error } = await admin
    .from("training_courses")
    .select(
      "id, slug, title, summary, category, is_required, ceu_credits, video_url, video_provider, transcript_md, duration_minutes, country_scope, required_for_verticals, sort_order, published_at, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const { data: questions } = await admin
    .from("training_quiz_questions")
    .select("id, sort_order, prompt, options, correct_index, explanation")
    .eq("course_id", id)
    .order("sort_order", { ascending: true });

  return NextResponse.json({ course, questions: questions ?? [] });
}

/** PATCH /api/admin/training/courses/[id] — partial update. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const v = validateCoursePatch(body);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  if (Object.keys(v.value).length === 0) {
    return NextResponse.json({ error: "No updatable fields supplied" }, {
      status: 400,
    });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("training_courses")
    .update({ ...v.value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, slug, title, published_at")
    .maybeSingle();

  if (error) {
    if (
      (error as { code?: string }).code === "23505" ||
      /duplicate key|unique/i.test(error.message)
    ) {
      return NextResponse.json(
        { error: "A course with this slug already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  await logAdminAction({
    admin: guard.admin,
    action: "training_course.update",
    targetType: "training_course",
    targetId: id,
    details: { fields: Object.keys(v.value) },
  });

  return NextResponse.json({ course: updated });
}
