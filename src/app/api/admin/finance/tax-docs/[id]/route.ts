import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TAX_DOC_STATUSES } from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/finance/tax-docs/[id]
 * Body: { status?, file_url? }
 *
 * POST /api/admin/finance/tax-docs/[id] — send-stub. Flips the row to
 * `sent` and stamps sent_at.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  if (typeof p.status === "string") {
    if (!(TAX_DOC_STATUSES as readonly string[]).includes(p.status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    update.status = p.status;
    if (p.status === "sent") {
      update.sent_at = new Date().toISOString();
    }
    if (p.status === "ready" || p.status === "sent") {
      // The first time we set ready / sent we also stamp generated_at
      // if it isn't already set.
      update.generated_at = new Date().toISOString();
    }
  }
  if (typeof p.file_url === "string" || p.file_url === null) {
    update.file_url = p.file_url ?? null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tax_documents")
    .update(update)
    .eq("id", id)
    .select("id, status, sent_at, generated_at, file_url")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 },
    );
  }
  await logAdminAction({
    admin: me,
    action: "tax_document.update",
    targetType: "tax_document",
    targetId: id,
    details: update,
  });
  return NextResponse.json({ doc: data });
}

/**
 * POST /api/admin/finance/tax-docs/[id] — send-stub.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tax_documents")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, status, sent_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 },
    );
  }
  await logAdminAction({
    admin: me,
    action: "tax_document.send_stub",
    targetType: "tax_document",
    targetId: id,
  });
  return NextResponse.json({ doc: data });
}
