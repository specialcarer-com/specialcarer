import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateSuggestionStatus } from "@/lib/ai/schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PATCH /api/ai/schedule-suggestions/[id]
 * Body: { status: 'accepted' | 'dismissed' }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const status = (body as { status?: unknown }).status;
  if (status !== "accepted" && status !== "dismissed") {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const result = await updateSuggestionStatus(user.id, id, status);
  if (!result.ok) {
    const code = result.error === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: result.error }, { status: code });
  }
  return NextResponse.json({ ok: true });
}
