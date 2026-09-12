import { NextResponse } from "next/server";
import { logAdminAction, requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderDsarErasedEmail } from "@/lib/dsar/emails";
import {
  handleDsarErase,
  maxRetainedUntil,
  summariseNulled,
  summariseRetained,
  type ErasureAdminClient,
} from "@/lib/dsar/erase";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dsar/[id]/erase
 *
 * Admin-only. Fulfils an Article-17 erasure request against a verified,
 * in-progress DSAR row. Runs the fixed erasure manifest (see
 * `src/lib/dsar/erase.ts`), writes an audit row per manifest step,
 * queues any deferred hard-deletes, flips the DSAR request to
 * state='erased', and emails the subject a completion notice with
 * legal-basis disclosure for anything retained.
 *
 * Preconditions (checked before the handler runs):
 *   * request row exists (`404 not_found`)
 *   * state is 'in_progress' (`409 not_ready`)
 *   * verified_at is set (`409 not_verified`)
 *
 * Response body:
 *   {
 *     ok: true,
 *     request_id, state: "erased",
 *     nulled_count, retained_count, deferred_count,
 *     email_sent, email_error,
 *     audit_persist_error, deferred_persist_error, request_persist_error,
 *     digest
 *   }
 */

const REQUEST_COLUMNS =
  "id, subject_user_id, subject_email, state, verified_at, request_type";

type DsarRequestPre = {
  id: string;
  subject_user_id: string | null;
  subject_email: string;
  state: string;
  verified_at: string | null;
  request_type: string;
};

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const admin = createAdminClient();

  // 1) Precondition read.
  const pre = await admin
    .from("dsar_requests")
    .select(REQUEST_COLUMNS)
    .eq("id", id)
    .maybeSingle<DsarRequestPre>();

  if (pre.error) {
    const code = (pre.error as { code?: string }).code;
    const message = pre.error.message ?? "";
    if (
      code === "42P01" ||
      /relation .* does not exist/i.test(message)
    ) {
      return NextResponse.json(
        { ok: false, error: "schema_not_ready", message: "DSAR schema not yet applied." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "db_error", message },
      { status: 500 },
    );
  }
  if (!pre.data) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "Request not found." },
      { status: 404 },
    );
  }
  if (pre.data.request_type !== "erasure") {
    return NextResponse.json(
      {
        ok: false,
        error: "wrong_request_type",
        message: `This endpoint only fulfils erasure requests; row is ${pre.data.request_type}.`,
      },
      { status: 409 },
    );
  }
  if (pre.data.state !== "in_progress") {
    return NextResponse.json(
      {
        ok: false,
        error: "not_ready",
        message: `Request is ${pre.data.state}, not in_progress.`,
      },
      { status: 409 },
    );
  }
  if (!pre.data.verified_at) {
    return NextResponse.json(
      {
        ok: false,
        error: "not_verified",
        message: "Subject has not verified this request.",
      },
      { status: 409 },
    );
  }

  // 2) Run the handler.
  //
  // The client contract is deliberately narrow — only the shape
  // handleDsarErase needs. The real Supabase client's `update(...).eq(...)`
  // returns `{ data, error, count }` after PostgREST's default select;
  // for our use we don't need the returned rows, only the error and
  // affected row count. `insert(...)` on the real client returns the
  // same shape.
  const eraseClient: ErasureAdminClient = {
    from(table) {
      const t = admin.from(table);
      return {
        update(values) {
          return {
            async eq(column, value) {
              const q = t.update(values).eq(column, value);
              // Chain a select() so PostgREST returns row count + rows.
              const withSelect = (q as unknown as {
                select?: (s?: string) => Promise<{
                  data: unknown[] | null;
                  error: { code?: string; message?: string } | null;
                  count?: number | null;
                }>;
              }).select?.("id") ?? q;
              const res = await withSelect;
              return {
                data: (res as { data?: unknown[] | null }).data ?? null,
                error: (res as {
                  error?: { code?: string; message?: string } | null;
                }).error ?? null,
                count: (res as { count?: number | null }).count ?? null,
              };
            },
          };
        },
        async insert(values) {
          const res = await t.insert(values);
          return {
            data: (res as { data?: unknown[] | null }).data ?? null,
            error: (res as {
              error?: { code?: string; message?: string } | null;
            }).error ?? null,
          };
        },
      };
    },
  };

  const result = await handleDsarErase(eraseClient, {
    dsar_request_id: pre.data.id,
    subject_email: pre.data.subject_email,
    subject_user_id: pre.data.subject_user_id,
  });

  // 3) Audit log (admin action side).
  await logAdminAction({
    admin: guard.admin,
    action: "dsar.erase",
    targetType: "dsar_request",
    targetId: pre.data.id,
    details: {
      subject_email: pre.data.subject_email,
      audit_rows: result.audit.length,
      deferred_rows: result.deferred.length,
      digest: result.digest,
      audit_persist_error: result.audit_persist_error,
      deferred_persist_error: result.deferred_persist_error,
      request_persist_error: result.request_persist_error,
    },
  });

  // 4) Completion email.
  const nulled = summariseNulled(result.audit);
  const retained = summariseRetained(result.audit);
  const rendered = renderDsarErasedEmail({
    subject_email: pre.data.subject_email,
    request_id: pre.data.id,
    nulled,
    retained,
    max_retained_until: maxRetainedUntil(result.audit),
    digest: result.digest,
  });
  const sent = await sendEmail({
    to: pre.data.subject_email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  return NextResponse.json({
    ok: true,
    request_id: pre.data.id,
    state: "erased",
    nulled_count: nulled.length,
    retained_count: retained.length,
    deferred_count: result.deferred.length,
    email_sent: sent.ok,
    email_error: sent.ok ? null : sent.error ?? "Unknown email error",
    audit_persist_error: result.audit_persist_error,
    deferred_persist_error: result.deferred_persist_error,
    request_persist_error: result.request_persist_error,
    digest: result.digest,
  });
}
