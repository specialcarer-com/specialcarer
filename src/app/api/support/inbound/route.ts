import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/support/inbound
 *
 * Webhook stub for future Intercom / Zendesk inbound forwarding.
 * Accepts JSON: { from_email, subject, body, channel?, priority? }
 * If `from_email` matches a known user, the ticket is filed against them;
 * otherwise the ticket has user_id=null until an admin resolves the
 * sender. No auth required for the stub itself — production should
 * verify a shared HMAC.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const fromEmail =
    typeof p.from_email === "string" ? p.from_email.toLowerCase() : "";
  const subject = typeof p.subject === "string" ? p.subject.trim() : "";
  const text = typeof p.body === "string" ? p.body.trim() : "";
  const channel = typeof p.channel === "string" ? p.channel : "email";
  const priority = typeof p.priority === "string" ? p.priority : "normal";
  if (!subject || !text) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  let userId: string | null = null;
  if (fromEmail) {
    const { data } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    if (data?.users) {
      const match = data.users.find(
        (u) => (u.email ?? "").toLowerCase() === fromEmail,
      );
      if (match) userId = match.id;
    }
  }

  const { data: ticket, error } = await admin
    .from("support_tickets")
    .insert({
      subject: subject.slice(0, 200),
      user_id: userId,
      channel,
      priority: ["low", "normal", "high", "urgent"].includes(priority)
        ? priority
        : "normal",
    })
    .select("id, ticket_number")
    .single();
  if (error || !ticket) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  await admin.from("support_messages").insert({
    ticket_id: ticket.id,
    author_id: null,
    author_role: "system",
    body: `Inbound from ${fromEmail || "unknown"}\n\n${text.slice(0, 10_000)}`,
    internal_note: false,
  });
  return NextResponse.json({ ticket });
}
