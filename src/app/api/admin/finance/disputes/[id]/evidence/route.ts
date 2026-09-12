/**
 * POST /api/admin/finance/disputes/[id]/evidence
 *
 * Admin-only. Transitions a `stripe_dispute_cases` row from
 * `'opened'` or `'under_review'` to `'evidence_submitted'`, recording
 * that our operator has uploaded the evidence file(s) via the Stripe
 * dashboard.
 *
 * This does NOT touch Stripe — the Stripe dashboard remains the source
 * of truth for the actual evidence files. Our row is a local
 * bookkeeping flag so the admin queue stops surfacing the case as
 * awaiting our response.
 *
 * Terminal-state rows (won/lost/warning_closed) reject with 409.
 */

import { NextResponse } from "next/server";
import { logAdminAction, requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { markEvidenceSubmitted } from "@/lib/stripe/dispute-webhook";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { ok: false, error: "invalid_id" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const result = await markEvidenceSubmitted(admin, id);

  if (!result.ok) {
    const status =
      result.reason === "not_found"
        ? 404
        : result.reason === "already_terminal"
          ? 409
          : 500;
    return NextResponse.json(
      { ok: false, error: result.error, reason: result.reason },
      { status },
    );
  }

  // Best-effort audit log — do not fail the request if the audit
  // helper throws (it can, e.g., if admin_audit_log schema drifts).
  try {
    await logAdminAction({
      admin: guard.admin,
      action: "stripe_dispute.mark_evidence_submitted",
      targetType: "stripe_dispute_case",
      targetId: id,
      details: { changed: result.changed },
    });
  } catch (err) {
    console.error("[disputes] audit log failed", err);
  }

  return NextResponse.json({ ok: true, changed: result.changed });
}
