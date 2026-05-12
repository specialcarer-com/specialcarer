import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** POST /api/admin/training/courses/[id]/publish — set published_at = now(). */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const admin = createAdminClient();

  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("training_courses")
    .update({ published_at: now, updated_at: now })
    .eq("id", id)
    .select("id, slug, published_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  await logAdminAction({
    admin: guard.admin,
    action: "training_course.publish",
    targetType: "training_course",
    targetId: id,
  });

  return NextResponse.json({ course: updated });
}
