import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TAX_DOC_TYPES,
  type TaxDocType,
} from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/finance/tax-docs?tax_year=2025&doc_type=p60
 */
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const taxYear = url.searchParams.get("tax_year");
  const docType = url.searchParams.get("doc_type");

  const admin = createAdminClient();
  let q = admin
    .from("tax_documents")
    .select(
      "id, user_id, doc_type, tax_year, file_url, generated_at, sent_at, status",
    )
    .order("tax_year", { ascending: false })
    .order("generated_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (taxYear) {
    const n = Number(taxYear);
    if (Number.isInteger(n)) q = q.eq("tax_year", n);
  }
  if (docType && (TAX_DOC_TYPES as readonly string[]).includes(docType)) {
    q = q.eq("doc_type", docType);
  }
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ docs: data ?? [] });
}

/**
 * POST /api/admin/finance/tax-docs — generate-stub.
 * Body: { user_id, doc_type, tax_year }
 * Creates a draft row. Real generation (PDF rendering) is out of scope
 * for the stub.
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
  const userId = typeof p.user_id === "string" ? p.user_id : "";
  const docType = p.doc_type;
  const taxYear = typeof p.tax_year === "number" ? p.tax_year : NaN;
  if (!userId) {
    return NextResponse.json({ error: "missing_user" }, { status: 400 });
  }
  if (
    typeof docType !== "string" ||
    !(TAX_DOC_TYPES as readonly string[]).includes(docType)
  ) {
    return NextResponse.json({ error: "invalid_doc_type" }, { status: 400 });
  }
  if (!Number.isInteger(taxYear) || taxYear < 2020 || taxYear > 2099) {
    return NextResponse.json({ error: "invalid_tax_year" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tax_documents")
    .insert({
      user_id: userId,
      doc_type: docType as TaxDocType,
      tax_year: taxYear,
      status: "draft",
    })
    .select("id, user_id, doc_type, tax_year, status")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  await logAdminAction({
    admin: me,
    action: "tax_document.generate_stub",
    targetType: "tax_document",
    targetId: data.id,
    details: { userId, docType, taxYear },
  });
  return NextResponse.json({ doc: data });
}
