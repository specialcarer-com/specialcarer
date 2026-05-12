/**
 * Pure handler functions for the admin training course API routes.
 * Extracted so they can be unit-tested with stubbed dependencies (the
 * route.ts files import these and pass in real Supabase + auth clients).
 *
 * Lives in an underscore-prefixed file so Next.js route conventions don't
 * try to interpret it as a routable segment.
 */
import { NextResponse } from "next/server";
import {
  DRAFT_FUTURE,
  validateCourseCreate,
  validateQuestionSet,
} from "@/lib/admin/training-validation";
import type { AdminUser } from "@/lib/admin/auth";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type LogActionFn = (input: {
  admin: AdminUser;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}) => Promise<void>;

/** POST /api/admin/training/courses */
export async function handleCreateCourse(deps: {
  admin: AdminUser;
  client: AdminClient;
  logAction: LogActionFn;
  body: Record<string, unknown>;
}): Promise<Response> {
  const v = validateCourseCreate(deps.body);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  const publishNow = Boolean(deps.body.publish_now);
  const insert = {
    slug: v.value.slug,
    title: v.value.title,
    summary: v.value.summary,
    category: v.value.category,
    is_required: v.value.is_required,
    ceu_credits: v.value.ceu_credits,
    video_url: v.value.video_url,
    video_provider: v.value.video_provider,
    transcript_md: v.value.transcript_md,
    duration_minutes: v.value.duration_minutes,
    country_scope: v.value.country_scope,
    required_for_verticals: v.value.required_for_verticals,
    sort_order: v.value.sort_order,
    published_at: publishNow ? new Date().toISOString() : DRAFT_FUTURE,
  };
  const { data: created, error } = await deps.client
    .from("training_courses")
    .insert(insert)
    .select("id, slug, title, published_at")
    .single();
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
  await deps.logAction({
    admin: deps.admin,
    action: "training_course.create",
    targetType: "training_course",
    targetId: created.id,
    details: { slug: created.slug, publish_now: publishNow },
  });
  return NextResponse.json({ course: created }, { status: 201 });
}

/** PUT /api/admin/training/courses/[id]/questions */
export async function handleReplaceQuestions(deps: {
  admin: AdminUser;
  client: AdminClient;
  logAction: LogActionFn;
  courseId: string;
  body: { questions?: unknown };
}): Promise<Response> {
  const v = validateQuestionSet(deps.body.questions);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  const { data: course } = await deps.client
    .from("training_courses")
    .select("id")
    .eq("id", deps.courseId)
    .maybeSingle();
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  const { error: delErr } = await deps.client
    .from("training_quiz_questions")
    .delete()
    .eq("course_id", deps.courseId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }
  if (v.value.length > 0) {
    const rows = v.value.map((q) => ({
      course_id: deps.courseId,
      sort_order: q.sort_order,
      prompt: q.prompt,
      options: q.options,
      correct_index: q.correct_index,
      explanation: q.explanation,
    }));
    const { error: insErr } = await deps.client
      .from("training_quiz_questions")
      .insert(rows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }
  await deps.logAction({
    admin: deps.admin,
    action: "training_course.questions.replace",
    targetType: "training_course",
    targetId: deps.courseId,
    details: { count: v.value.length },
  });
  return NextResponse.json({ ok: true, count: v.value.length });
}
