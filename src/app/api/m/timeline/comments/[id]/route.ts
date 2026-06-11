import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteComment } from "@/lib/timeline/server";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/m/timeline/comments/[id]
 *
 * Delete a comment. RLS restricts deletion to the comment's author.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const result = await deleteComment(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
