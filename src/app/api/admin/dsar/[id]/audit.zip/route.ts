import { NextResponse } from "next/server";
import { logAdminAction, requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildErasureAuditZip,
  type ErasureBundleAuditRow,
  type ErasureBundleDeferredRow,
  type ErasureBundleRequest,
} from "@/lib/dsar/erasure-audit-bundle";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dsar/[id]/audit.zip
 *
 * Admin-only. Returns the erasure audit bundle for a DSAR request as
 * a ZIP archive with three files:
 *
 *   * manifest.json — request + subject metadata, aggregate counts,
 *     sha256 digest of the two CSVs below.
 *   * audit.csv     — one row per manifest step written by
 *     `handleDsarErase` (from `public.dsar_erasure_audit`).
 *   * deferred.csv  — the queue of rows scheduled for a later
 *     hard-delete (from `public.dsar_deferred_erasure_queue`).
 *
 * Preconditions
 *   * request row exists (404)
 *   * request_type is 'erasure' (409 wrong_request_type)
 *   * state is 'erased' (409 not_erased) — we only offer the bundle
 *     after fulfilment; incomplete requests would produce a
 *     misleading empty ZIP.
 *
 * Errors from the audit tables (e.g. `schema_not_ready` on an
 * environment where the C1 migration hasn't been applied) return a
 * JSON error rather than a truncated ZIP. Once the migration is in,
 * both tables always exist and read succeeds for admins under the
 * `dsar_erasure_audit_admin_read` / `dsar_deferred_queue_admin_read`
 * RLS policies.
 */

const REQUEST_COLUMNS =
  "id, subject_email, subject_user_id, request_type, state, submitted_at, verified_at, updated_at";

const AUDIT_COLUMNS =
  "id, table_name, column_name, owner_column, owner_value, action, reason, retained_until, row_count, error, executed_at";

const DEFERRED_COLUMNS =
  "id, table_name, owner_column, owner_value, column_name, retained_until, state, attempt_count, last_attempt_at, last_error, completed_at, created_at";

function isSchemaNotReady(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  // PostgREST returns PGRST205 / PGRST106 for unknown tables/columns;
  // Postgres itself returns SQLSTATE 42P01 for undefined_table.
  if (err.code === "PGRST205" || err.code === "PGRST106" || err.code === "42P01") return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("could not find the table") ||
    msg.includes("does not exist") ||
    msg.includes("undefined_table")
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1) Load the request row.
  const reqRes = await admin
    .from("dsar_requests")
    .select(REQUEST_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (reqRes.error) {
    return NextResponse.json(
      { ok: false, error: "request_read_failed", message: reqRes.error.message },
      { status: 500 },
    );
  }
  const request = reqRes.data as ErasureBundleRequest | null;
  if (!request) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (request.request_type !== "erasure") {
    return NextResponse.json(
      {
        ok: false,
        error: "wrong_request_type",
        message: `Request type is '${request.request_type}', expected 'erasure'.`,
      },
      { status: 409 },
    );
  }
  if (request.state !== "erased") {
    return NextResponse.json(
      {
        ok: false,
        error: "not_erased",
        message: `Request state is '${request.state}', expected 'erased'.`,
      },
      { status: 409 },
    );
  }

  // 2) Load audit rows.
  const auditRes = await admin
    .from("dsar_erasure_audit")
    .select(AUDIT_COLUMNS)
    .eq("dsar_request_id", id)
    .order("executed_at", { ascending: true });

  if (auditRes.error) {
    if (isSchemaNotReady(auditRes.error)) {
      return NextResponse.json(
        { ok: false, error: "schema_not_ready", message: auditRes.error.message },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "audit_read_failed", message: auditRes.error.message },
      { status: 500 },
    );
  }
  const audit = (auditRes.data ?? []) as ErasureBundleAuditRow[];

  // 3) Load deferred queue rows.
  const deferredRes = await admin
    .from("dsar_deferred_erasure_queue")
    .select(DEFERRED_COLUMNS)
    .eq("dsar_request_id", id)
    .order("retained_until", { ascending: true });

  if (deferredRes.error) {
    if (isSchemaNotReady(deferredRes.error)) {
      return NextResponse.json(
        { ok: false, error: "schema_not_ready", message: deferredRes.error.message },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "deferred_read_failed", message: deferredRes.error.message },
      { status: 500 },
    );
  }
  const deferred = (deferredRes.data ?? []) as ErasureBundleDeferredRow[];

  // 4) Build the ZIP.
  const { buffer, digest, manifest } = buildErasureAuditZip({
    request,
    audit,
    deferred,
    generated_at: new Date(),
  });

  // 5) Audit-log the download itself. Best-effort.
  await logAdminAction({
    admin: guard.admin,
    action: "dsar_erasure_audit_download",
    targetType: "dsar_request",
    targetId: id,
    details: {
      audit_rows: manifest.totals.audit_rows,
      deferred_rows: manifest.totals.deferred_rows,
      digest: manifest.digest,
    },
  });

  const filename = `dsar-erasure-audit-${id}.zip`;
  // NextResponse expects a Web-fetch BodyInit; the DOM-lib types don't
  // accept a Node Buffer or a SharedArrayBufferLike, so copy the bytes
  // into a fresh ArrayBuffer before handing them back.
  const ab = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(ab).set(buffer);
  return new NextResponse(ab, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
      "X-DSAR-Erasure-Digest": manifest.digest,
      "Cache-Control": "no-store",
    },
  });
}
