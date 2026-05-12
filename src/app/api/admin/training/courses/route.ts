import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPublished } from "@/lib/admin/training-validation";
import { handleCreateCourse } from "@/lib/admin/training-handlers";

export const dynamic = "force-dynamic";

type CourseRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  is_required: boolean;
  ceu_credits: number;
  video_url: string | null;
  video_provider: string;
  duration_minutes: number;
  country_scope: string;
  required_for_verticals: string[];
  sort_order: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/** GET /api/admin/training/courses — list all courses incl. drafts. */
export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();

  const { data: courses, error } = await admin
    .from("training_courses")
    .select(
      "id, slug, title, summary, category, is_required, ceu_credits, video_url, video_provider, duration_minutes, country_scope, required_for_verticals, sort_order, published_at, created_at, updated_at",
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (courses ?? []) as CourseRow[];

  const counts = new Map<string, number>();
  if (rows.length > 0) {
    const { data: qrows } = await admin
      .from("training_quiz_questions")
      .select("course_id")
      .in(
        "course_id",
        rows.map((r) => r.id),
      );
    for (const q of (qrows ?? []) as { course_id: string }[]) {
      counts.set(q.course_id, (counts.get(q.course_id) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    courses: rows.map((c) => ({
      ...c,
      question_count: counts.get(c.id) ?? 0,
      status: isPublished(c.published_at) ? "published" : "draft",
    })),
  });
}

/** POST /api/admin/training/courses — create. */
export async function POST(req: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  return handleCreateCourse({
    admin: guard.admin,
    client: createAdminClient(),
    logAction: logAdminAction,
    body,
  });
}
