import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLIANCE_DOC_TYPES } from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/compliance/dashboard
 * Returns rollup counts by status + per-doc-type expiry buckets.
 */
export async function GET() {
  const _adminGuard = await requireAdminApi();

  if (!_adminGuard.ok) return _adminGuard.response;
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const cutoff = in30.toISOString().slice(0, 10);

  const [pending, verified, expired, rejected, expiringSoon] =
    await Promise.all([
      admin
        .from("compliance_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      admin
        .from("compliance_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "verified"),
      admin
        .from("compliance_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "expired"),
      admin
        .from("compliance_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "rejected"),
      admin
        .from("compliance_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "verified")
        .lte("expires_at", cutoff)
        .gte("expires_at", today),
    ]);

  // Per doc-type buckets (for the chart strip).
  const perType: Record<string, number> = {};
  for (const t of COMPLIANCE_DOC_TYPES) {
    const { count } = await admin
      .from("compliance_documents")
      .select("id", { count: "exact", head: true })
      .eq("doc_type", t)
      .in("status", ["pending", "verified"]);
    perType[t] = count ?? 0;
  }

  return NextResponse.json({
    counts: {
      pending: pending.count ?? 0,
      verified: verified.count ?? 0,
      expired: expired.count ?? 0,
      rejected: rejected.count ?? 0,
      expiring_soon: expiringSoon.count ?? 0,
    },
    per_doc_type: perType,
  });
}
