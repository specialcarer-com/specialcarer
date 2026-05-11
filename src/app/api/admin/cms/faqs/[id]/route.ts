import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
  for (const k of [
    "category",
    "question",
    "answer_md",
    "status",
  ] as const) {
    if (typeof p[k] === "string") update[k] = p[k];
  }
  if (typeof p.sort_order === "number") update.sort_order = p.sort_order;
  if (Array.isArray(p.audience)) {
    update.audience = p.audience.filter(
      (x): x is string => typeof x === "string",
    );
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("cms_faqs")
    .update(update)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await logAdminAction({
    admin: me,
    action: "cms_faq.update",
    targetType: "cms_faq",
    targetId: id,
    details: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin
    .from("cms_faqs")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await logAdminAction({
    admin: me,
    action: "cms_faq.archive",
    targetType: "cms_faq",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
