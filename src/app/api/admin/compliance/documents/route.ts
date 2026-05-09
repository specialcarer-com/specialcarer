import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  COMPLIANCE_DOC_TYPES,
  COMPLIANCE_STATUSES,
  type ComplianceDocType,
  type ComplianceStatus,
} from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const docType = url.searchParams.get("doc_type");
  const status = url.searchParams.get("status");
  const expiringWithin = url.searchParams.get("expiring_within");

  const admin = createAdminClient();
  let q = admin
    .from("compliance_alerts_view")
    .select(
      "document_id, caregiver_id, full_name, email, doc_type, status, expires_at, days_to_expiry",
    )
    .order("days_to_expiry", { ascending: true, nullsFirst: false })
    .limit(500);
  if (docType && (COMPLIANCE_DOC_TYPES as readonly string[]).includes(docType)) {
    q = q.eq("doc_type", docType);
  }
  if (status && (COMPLIANCE_STATUSES as readonly string[]).includes(status)) {
    q = q.eq("status", status);
  }
  if (expiringWithin) {
    const n = Number(expiringWithin);
    if (Number.isFinite(n)) q = q.lte("days_to_expiry", n);
  }
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ documents: data ?? [] });
}

/**
 * POST /api/admin/compliance/documents
 * Body: { caregiver_id, doc_type, status?, file_url?, issued_at?, expires_at?, notes? }
 */
export async function POST(req: Request) {
  const me = await requireAdmin();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const caregiverId = typeof p.caregiver_id === "string" ? p.caregiver_id : "";
  const docType = p.doc_type;
  if (!caregiverId) {
    return NextResponse.json({ error: "missing_caregiver" }, { status: 400 });
  }
  if (
    typeof docType !== "string" ||
    !(COMPLIANCE_DOC_TYPES as readonly string[]).includes(docType)
  ) {
    return NextResponse.json({ error: "invalid_doc_type" }, { status: 400 });
  }
  const status =
    typeof p.status === "string" &&
    (COMPLIANCE_STATUSES as readonly string[]).includes(p.status)
      ? (p.status as ComplianceStatus)
      : "pending";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("compliance_documents")
    .insert({
      caregiver_id: caregiverId,
      doc_type: docType as ComplianceDocType,
      status,
      file_url: typeof p.file_url === "string" ? p.file_url : null,
      issued_at: typeof p.issued_at === "string" ? p.issued_at : null,
      expires_at: typeof p.expires_at === "string" ? p.expires_at : null,
      notes: typeof p.notes === "string" ? p.notes : null,
      verified_by: status === "verified" ? me.id : null,
      verified_at: status === "verified" ? new Date().toISOString() : null,
    })
    .select("id, caregiver_id, doc_type, status")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  await logAdminAction({
    admin: me,
    action: "compliance_document.create",
    targetType: "compliance_document",
    targetId: data.id,
    details: { caregiverId, docType, status },
  });
  return NextResponse.json({ document: data });
}
