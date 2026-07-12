import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addComment } from "@/lib/timeline/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/timeline/events/[id]/comments  { body }
 *
 * Add a comment to a timeline event. RLS enforces that only the seeker or an
 * active family member with timeline_role='commenter' may write.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const p = (payload ?? {}) as Record<string, unknown>;
  const body = typeof p.body === "string" ? p.body : "";

  const result = await addComment(eventId, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ commentId: result.commentId });
}
