import { NextResponse } from "next/server";
import { logAdminAction, requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderDsarRejectedEmail } from "@/lib/dsar/emails";
import {
  handleDsarReject,
  type DsarRejectClient,
  type DsarRejectRow,
} from "@/lib/dsar/reject";

export const dynamic = "force-dynamic";

const REJECT_COLUMNS =
  "id, subject_email, request_type, state, notes";

/**
 * POST /api/admin/dsar/[id]/reject
 *
 * Admin-only. Marks a non-terminal DSAR request as `rejected` with a
 * required, admin-typed reason. Sends the subject a rejection email
 * (with ICO signposting) and writes an audit-log entry.
 *
 * Body: { reason: string }  (10–2000 chars, trimmed)
 *
 * The state guard on the UPDATE means concurrent rejections /
 * fulfilments do not clobber each other — the second attempt returns
 * 409 concurrent_update and the queue view refreshes.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }
  const reason =
    typeof body === "object" &&
    body !== null &&
    "reason" in body &&
    typeof (body as { reason: unknown }).reason === "string"
      ? (body as { reason: string }).reason
      : "";

  const admin = createAdminClient();

  const client: DsarRejectClient = {
    async fetchById(rowId) {
      const { data, error } = await admin
        .from("dsar_requests")
        .select(REJECT_COLUMNS)
        .eq("id", rowId)
        .maybeSingle<DsarRejectRow>();
      return {
        data: data ?? null,
        error: error
          ? { code: (error as { code?: string }).code, message: error.message }
          : null,
      };
    },
    async markRejected(input) {
      // The `.eq("state", input.previous_state)` guard means concurrent
      // updates (another admin, or the fulfilment cron flipping to
      // delivered) do not overwrite each other.
      const note = `Rejected by ${input.admin_email}: ${input.reason}`;
      const { data, error } = await admin
        .from("dsar_requests")
        .update({
          state: "rejected",
          notes: note,
        })
        .eq("id", input.id)
        .eq("state", input.previous_state)
        .select(REJECT_COLUMNS)
        .maybeSingle<DsarRejectRow>();
      return {
        data: data ?? null,
        error: error
          ? { code: (error as { code?: string }).code, message: error.message }
          : null,
      };
    },
  };

  const adminEmail = guard.admin.email ?? "admin";

  const result = await handleDsarReject({
    input: {
      request_id: id,
      reason,
      admin_email: adminEmail,
    },
    client,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.code, message: result.message },
      { status: result.status },
    );
  }

  // Audit + email are best-effort. If the audit log fails we still 200
  // (the state has moved and re-rejecting a `rejected` row is a no-op),
  // but we surface an email-send failure so the admin can retry.
  await logAdminAction({
    admin: guard.admin,
    action: "dsar.reject",
    targetType: "dsar_request",
    targetId: result.row.id,
    details: {
      previous_state: result.previous_state,
      subject_email: result.row.subject_email,
      request_type: result.row.request_type,
      reason_length: reason.trim().length,
    },
  });

  const email = renderDsarRejectedEmail({
    subject_email: result.row.subject_email,
    request_type: result.row.request_type,
    reason: reason.trim(),
  });
  const sent = await sendEmail({
    to: result.row.subject_email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  return NextResponse.json({
    ok: true,
    request_id: result.row.id,
    state: result.row.state,
    email_sent: sent.ok,
    email_error: sent.ok ? null : sent.error ?? "Unknown email error",
  });
}
