import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const me = guard.admin;

  const { code: rawCode } = await params;
  const code = rawCode.trim().toUpperCase();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;

  const update: Record<string, unknown> = {};
  if (typeof p.name === "string" && p.name.trim()) update.name = p.name.trim();
  if (typeof p.flag_emoji === "string")
    update.flag_emoji = p.flag_emoji.trim() || null;
  if (typeof p.enabled_for_signup === "boolean")
    update.enabled_for_signup = p.enabled_for_signup;
  if (typeof p.enabled_for_search === "boolean")
    update.enabled_for_search = p.enabled_for_search;
  if (typeof p.currency_code === "string" && p.currency_code.trim())
    update.currency_code = p.currency_code.trim().toUpperCase();
  if (typeof p.default_locale === "string" && p.default_locale.trim())
    update.default_locale = p.default_locale.trim();
  if (typeof p.display_order === "number")
    update.display_order = p.display_order;
  if (typeof p.notes === "string") update.notes = p.notes.trim() || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("countries")
    .update(update)
    .eq("code", code);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction({
    admin: me,
    action: "country.update",
    targetType: "country",
    targetId: code,
    details: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const me = guard.admin;

  const { code: rawCode } = await params;
  const code = rawCode.trim().toUpperCase();

  const admin = createAdminClient();
  const { error } = await admin.from("countries").delete().eq("code", code);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction({
    admin: me,
    action: "country.delete",
    targetType: "country",
    targetId: code,
  });
  return NextResponse.json({ ok: true });
}
