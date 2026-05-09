import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/support/tickets/[id]/messages
 * Body: { body, internal_note? }
 * Author is the admin caller; recorded as 'admin' role.
 *
 * Side-effects: stamps first_response_at on the ticket if null and the
 * message is NOT an internal note.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await requireAdmin();
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const text = typeof p.body === "string" ? p.body.trim() : "";
  const internal = typeof p.internal_note === "boolean" ? p.internal_note : false;

  if (text.length < 1 || text.length > 10000) {
    return NextResponse.json({ error: "body_length" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: e1 } = await admin.from("support_messages").insert({
    ticket_id: id,
    author_id: me.id,
    author_role: "admin",
    body: text,
    internal_note: internal,
  });
  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 });
  }

  if (!internal) {
    // Stamp first_response_at if it's still null.
    const { data: t } = await admin
      .from("support_tickets")
      .select("first_response_at")
      .eq("id", id)
      .maybeSingle<{ first_response_at: string | null }>();
    if (t && t.first_response_at == null) {
      await admin
        .from("support_tickets")
        .update({ first_response_at: new Date().toISOString() })
        .eq("id", id);
    }
  }
  return NextResponse.json({ ok: true });
}
