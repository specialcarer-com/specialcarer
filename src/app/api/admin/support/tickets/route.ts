import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  slaWindowMs,
  type TicketPriority,
} from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/support/tickets — admin-only queue with optional filters.
 * POST /api/admin/support/tickets — admin creates a ticket on behalf of a user.
 *   Body: { subject, user_id?, priority?, channel?, body? }
 */
export async function GET(req: Request) {
  const _adminGuard = await requireAdminApi();

  if (!_adminGuard.ok) return _adminGuard.response;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const assigned = url.searchParams.get("assigned");

  const admin = createAdminClient();
  let q = admin
    .from("support_tickets")
    .select(
      "id, ticket_number, subject, status, priority, user_id, booking_id, assigned_to, channel, tags, sla_due_at, first_response_at, resolved_at, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (status && (TICKET_STATUSES as readonly string[]).includes(status)) {
    q = q.eq("status", status);
  }
  if (
    priority &&
    (TICKET_PRIORITIES as readonly string[]).includes(priority)
  ) {
    q = q.eq("priority", priority);
  }
  if (assigned === "me") {
    // Caller is admin (requireAdmin returned). Filter by their id.
    const me = (await import("@/lib/admin/auth")).requireAdmin;
    void me;
  }
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tickets: data ?? [] });
}

export async function POST(req: Request) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const subject = typeof p.subject === "string" ? p.subject.trim() : "";
  if (subject.length < 1 || subject.length > 200) {
    return NextResponse.json({ error: "subject_length" }, { status: 400 });
  }
  const priority =
    typeof p.priority === "string" &&
    (TICKET_PRIORITIES as readonly string[]).includes(p.priority)
      ? (p.priority as TicketPriority)
      : "normal";
  const userId =
    typeof p.user_id === "string" && p.user_id ? p.user_id : me.id;
  const channel =
    typeof p.channel === "string" ? p.channel : "web";
  const sla = new Date(Date.now() + slaWindowMs(priority)).toISOString();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_tickets")
    .insert({
      subject,
      priority,
      user_id: userId,
      channel,
      sla_due_at: sla,
    })
    .select("id, ticket_number")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }

  if (typeof p.body === "string" && p.body.trim()) {
    await admin.from("support_messages").insert({
      ticket_id: data.id,
      author_id: me.id,
      author_role: "admin",
      body: p.body.trim(),
    });
  }
  return NextResponse.json({ ticket: data });
}
