import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  TICKET_PRIORITIES,
  slaWindowMs,
  type TicketPriority,
} from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/support/tickets — user-creates-ticket entrypoint.
 * Body: { subject, body, booking_id?, channel?, priority? }
 * Auth required (anonymous ticketing not supported in 3.12).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const subject = typeof p.subject === "string" ? p.subject.trim() : "";
  const text = typeof p.body === "string" ? p.body.trim() : "";
  const bookingId =
    typeof p.booking_id === "string" && p.booking_id ? p.booking_id : null;
  const channel = typeof p.channel === "string" ? p.channel : "web";
  const priority =
    typeof p.priority === "string" &&
    (TICKET_PRIORITIES as readonly string[]).includes(p.priority)
      ? (p.priority as TicketPriority)
      : "normal";

  if (subject.length < 1 || subject.length > 200) {
    return NextResponse.json({ error: "subject_length" }, { status: 400 });
  }
  if (text.length < 1 || text.length > 10000) {
    return NextResponse.json({ error: "body_length" }, { status: 400 });
  }

  const sla = new Date(Date.now() + slaWindowMs(priority)).toISOString();

  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .insert({
      subject,
      user_id: user.id,
      booking_id: bookingId,
      channel,
      priority,
      sla_due_at: sla,
    })
    .select("id, ticket_number")
    .single();
  if (error || !ticket) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }

  await supabase.from("support_messages").insert({
    ticket_id: ticket.id,
    author_id: user.id,
    author_role: "user",
    body: text,
    internal_note: false,
  });
  return NextResponse.json({ ticket });
}
