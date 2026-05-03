import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET — list messages (RLS limits to booking parties). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at, read_at")
    .eq("booking_id", id)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mark unread messages from the other party as read
  const unread = (data ?? []).filter((m) => m.sender_id !== user.id && !m.read_at);
  if (unread.length > 0) {
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in(
        "id",
        unread.map((m) => m.id),
      );
  }

  return NextResponse.json({ messages: data ?? [] });
}

/** POST — send a message (RLS limits to booking parties). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { body } = (await req.json()) as { body?: string };
  if (!body || typeof body !== "string" || body.trim().length === 0) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }
  if (body.length > 4000) {
    return NextResponse.json({ error: "Message too long" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      booking_id: id,
      sender_id: user.id,
      body: body.trim(),
    })
    .select("id, sender_id, body, created_at, read_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: data });
}
