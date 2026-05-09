import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import TicketActions from "./TicketActions";
import TicketReply from "./TicketReply";
import RefundButton from "./RefundButton";
import type {
  TicketPriority,
  TicketStatus,
} from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

type Ticket = {
  id: string;
  ticket_number: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  user_id: string | null;
  booking_id: string | null;
  assigned_to: string | null;
  channel: string;
  tags: string[];
  sla_due_at: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

type Message = {
  id: string;
  author_id: string | null;
  author_role: "user" | "admin" | "system";
  body: string;
  internal_note: boolean;
  created_at: string;
};

type RecentBooking = {
  id: string;
  status: string;
  starts_at: string | null;
  total_cents: number | null;
  currency: string | null;
};

export default async function TicketDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const { data: ticket } = await admin
    .from("support_tickets")
    .select(
      "id, ticket_number, subject, status, priority, user_id, booking_id, assigned_to, channel, tags, sla_due_at, first_response_at, resolved_at, created_at",
    )
    .eq("id", id)
    .maybeSingle<Ticket>();
  if (!ticket) notFound();

  const { data: messages } = await admin
    .from("support_messages")
    .select(
      "id, author_id, author_role, body, internal_note, created_at",
    )
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  let userProfile: { full_name: string | null; email: string | null } | null = null;
  let recent: RecentBooking[] = [];
  if (ticket.user_id) {
    const { data: prof } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", ticket.user_id)
      .maybeSingle<{ full_name: string | null; email: string | null }>();
    userProfile = prof ?? null;
    const { data: rb } = await admin
      .from("bookings")
      .select("id, status, starts_at, total_cents, currency")
      .or(`seeker_id.eq.${ticket.user_id},caregiver_id.eq.${ticket.user_id}`)
      .order("starts_at", { ascending: false })
      .limit(5);
    recent = (rb ?? []) as RecentBooking[];
  }

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6">
      <div className="space-y-6">
        <div>
          <p className="text-xs text-slate-500">
            <Link
              href="/admin/support"
              className="hover:text-slate-700"
            >
              ← Tickets
            </Link>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
              {ticket.subject}
            </h1>
            <span className="font-mono text-xs text-slate-500">
              #{ticket.ticket_number}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Opened {new Date(ticket.created_at).toLocaleString("en-GB")} via{" "}
            {ticket.channel}
            {ticket.sla_due_at &&
              ` · SLA ${new Date(ticket.sla_due_at).toLocaleString("en-GB")}`}
          </p>
        </div>

        <ul className="space-y-3">
          {((messages ?? []) as Message[]).map((m) => (
            <li
              key={m.id}
              className={`rounded-2xl border p-4 ${
                m.internal_note
                  ? "bg-amber-50 border-amber-200"
                  : m.author_role === "admin"
                    ? "bg-white border-slate-200"
                    : m.author_role === "system"
                      ? "bg-slate-50 border-slate-200"
                      : "bg-teal-50 border-teal-100"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold">
                  {m.internal_note
                    ? "Internal note"
                    : m.author_role === "admin"
                      ? "SpecialCarer support"
                      : m.author_role === "system"
                        ? "System"
                        : "User"}
                </span>
                <span>{new Date(m.created_at).toLocaleString("en-GB")}</span>
              </div>
              <p className="mt-2 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {m.body}
              </p>
            </li>
          ))}
        </ul>

        <TicketReply ticketId={ticket.id} />
      </div>

      <aside className="space-y-4">
        <TicketActions
          ticketId={ticket.id}
          initialStatus={ticket.status}
          initialPriority={ticket.priority}
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            User
          </p>
          {ticket.user_id ? (
            <>
              <p className="text-sm font-semibold text-slate-900">
                {userProfile?.full_name ?? ticket.user_id.slice(0, 8)}
              </p>
              <p className="text-xs text-slate-500">
                {userProfile?.email ?? "—"}
              </p>
              <Link
                href={`/admin/users/${ticket.user_id}`}
                className="text-xs font-semibold text-teal-700 hover:underline"
              >
                Open user →
              </Link>
            </>
          ) : (
            <p className="text-sm text-slate-500">No user attached.</p>
          )}
        </div>

        {recent.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Recent bookings
            </p>
            <ul className="space-y-1.5">
              {recent.map((b) => (
                <li key={b.id} className="text-xs">
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    className="text-slate-900 hover:underline font-mono"
                  >
                    {b.id.slice(0, 8)}
                  </Link>{" "}
                  · {b.status}
                  {b.total_cents != null && b.currency && (
                    <span className="text-slate-500">
                      {" "}
                      · {(b.total_cents / 100).toFixed(2)} {b.currency.toUpperCase()}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {ticket.booking_id && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Linked booking
            </p>
            <Link
              href={`/admin/bookings/${ticket.booking_id}`}
              className="text-sm font-semibold text-slate-900 hover:underline"
            >
              {ticket.booking_id.slice(0, 8)} →
            </Link>
            <RefundButton bookingId={ticket.booking_id} />
          </div>
        )}
      </aside>
    </div>
  );
}
