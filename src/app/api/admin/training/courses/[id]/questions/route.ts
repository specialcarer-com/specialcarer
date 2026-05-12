import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleReplaceQuestions } from "@/lib/admin/training-handlers";

export const dynamic = "force-dynamic";

/**
 * PUT /api/admin/training/courses/[id]/questions
 * Body: { questions: [{ prompt, options[4], correct_index 0-3, explanation?, sort_order? }, ...] }
 * Replaces the question set (delete-then-insert).
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  let body: { questions?: unknown };
  try {
    body = (await req.json()) as { questions?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  return handleReplaceQuestions({
    admin: guard.admin,
    client: createAdminClient(),
    logAction: logAdminAction,
    courseId: id,
    body,
  });
}
