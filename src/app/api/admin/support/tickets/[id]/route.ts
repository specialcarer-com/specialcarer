import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  slaWindowMs,
  type TicketPriority,
} from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();
  const { data: ticket, error } = await admin
    .from("support_tickets")
    .select(
      "id, ticket_number, subject, status, priority, user_id, booking_id, assigned_to, channel, tags, sla_due_at, first_response_at, resolved_at, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !ticket) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { data: messages } = await admin
    .from("support_messages")
    .select(
      "id, author_id, author_role, body, attachments, internal_note, created_at",
    )
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });
  return NextResponse.json({ ticket, messages: messages ?? [] });
}

/**
 * PATCH /api/admin/support/tickets/[id]
 * Body: { status?, priority?, assigned_to? }
 */
export async function PATCH(
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

  const update: Record<string, unknown> = {};
  if (
    typeof p.status === "string" &&
    (TICKET_STATUSES as readonly string[]).includes(p.status)
  ) {
    update.status = p.status;
    if (p.status === "resolved" || p.status === "closed") {
      update.resolved_at = new Date().toISOString();
    }
  } else if (typeof p.status === "string") {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  if (
    typeof p.priority === "string" &&
    (TICKET_PRIORITIES as readonly string[]).includes(p.priority)
  ) {
    update.priority = p.priority;
    // Recompute SLA from now if priority changes upward.
    update.sla_due_at = new Date(
      Date.now() + slaWindowMs(p.priority as TicketPriority),
    ).toISOString();
  } else if (typeof p.priority === "string") {
    return NextResponse.json({ error: "invalid_priority" }, { status: 400 });
  }
  if (typeof p.assigned_to === "string" || p.assigned_to === null) {
    update.assigned_to = p.assigned_to ?? null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_tickets")
    .update(update)
    .eq("id", id)
    .select("id, status, priority, assigned_to, resolved_at, sla_due_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 },
    );
  }
  await logAdminAction({
    admin: me,
    action: "support_ticket.update",
    targetType: "support_ticket",
    targetId: id,
    details: update,
  });
  return NextResponse.json({ ticket: data });
}
