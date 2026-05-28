/**
 * P1-B10: pure handler for POST /api/m/chat/messages/[messageId]/report.
 *
 * The route resolves the auth + participation guard against the
 * message's thread, then hands a verified ReportClient to this
 * handler. Body shape, reason allow-list, and the actual insert live
 * here so they're unit-testable without a Supabase round-trip.
 */
import { NextResponse } from "next/server";

export type ReportableReason =
  | "harassment"
  | "spam"
  | "safeguarding"
  | "other";

const REPORTABLE_REASONS: ReportableReason[] = [
  "harassment",
  "spam",
  "safeguarding",
  "other",
];

export type ReportClient = {
  /**
   * Insert a user-reported flag row. The route resolves message_id →
   * thread_id and validates the caller is a participant; this method
   * is just the persisted write. Returns the new flag's id (or an
   * error result).
   */
  insertFlag(input: {
    message_id: string;
    thread_id: string;
    flagged_by: string;
    reason: ReportableReason;
    admin_notes: string | null;
  }): Promise<{
    data: { id: string } | null;
    error: { message: string } | null;
  }>;
  /**
   * Best-effort stamp of chat_messages.flagged_at. Errors here are
   * non-fatal — the flag row is the source of truth.
   */
  stampFlaggedAt(messageId: string): Promise<void>;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function handleReportMessage(input: {
  message_id: string;
  thread_id: string;
  user_id: string;
  body: unknown;
  client: ReportClient;
}): Promise<NextResponse<{ id: string } | { error: string }>> {
  const { message_id, thread_id, user_id, body, client } = input;
  if (!isPlainObject(body)) {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }
  const reason = body.reason;
  if (
    typeof reason !== "string" ||
    !REPORTABLE_REASONS.includes(reason as ReportableReason)
  ) {
    return NextResponse.json(
      { error: "Field `reason` is required and must be a valid value" },
      { status: 400 },
    );
  }
  // Notes are optional. Length cap mirrors chat body limits to keep
  // free-text predictable in the admin queue.
  const rawNotes = body.notes;
  let notes: string | null = null;
  if (rawNotes !== undefined && rawNotes !== null) {
    if (typeof rawNotes !== "string") {
      return NextResponse.json(
        { error: "Field `notes` must be a string" },
        { status: 400 },
      );
    }
    const trimmed = rawNotes.trim();
    if (trimmed.length > 4000) {
      return NextResponse.json(
        { error: "Field `notes` is too long (max 4000)" },
        { status: 400 },
      );
    }
    notes = trimmed.length === 0 ? null : trimmed;
  }

  const { data, error } = await client.insertFlag({
    message_id,
    thread_id,
    flagged_by: user_id,
    reason: reason as ReportableReason,
    admin_notes: notes,
  });
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "chat_report_failed" },
      { status: 500 },
    );
  }
  await client.stampFlaggedAt(message_id);
  return NextResponse.json({ id: data.id }, { status: 201 });
}
