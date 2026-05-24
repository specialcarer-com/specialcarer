import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage } from "@/lib/chat/server";
import { validateSendBody, type SendBody } from "@/lib/chat/send-handler";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/chat/[thread_id]/send
 * Body: { body?: string, attachment_path?: string, attachment_kind?: 'image'|'video'|'audio' }
 * Returns the inserted message row.
 *
 * 401 without a session. 403 if the caller is not a participant.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ thread_id: string }> },
) {
  const { thread_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: SendBody;
  try {
    payload = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validated = validateSendBody(payload);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }

  const admin = createAdminClient();
  const { data: seat } = await admin
    .from("chat_participants")
    .select("user_id")
    .eq("thread_id", thread_id)
    .eq("user_id", user.id)
    .maybeSingle<{ user_id: string }>();
  if (!seat) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const message = await sendMessage(thread_id, user.id, validated.input);
    return NextResponse.json({ message });
  } catch (e) {
    const err = e instanceof Error ? e.message : "send failed";
    return NextResponse.json({ error: err }, { status: 500 });
  }
}
