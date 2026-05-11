import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSlot } from "@/lib/page-banners/registry";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ pageKey: string }> };

/** PATCH — update metadata (alt, focal point, active) without re-uploading. */
export async function PATCH(req: Request, { params }: Ctx) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  const { pageKey } = await params;
  if (!getSlot(pageKey))
    return NextResponse.json({ error: "unknown_page_key" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: me.id,
  };
  if (typeof body.alt === "string")
    update.alt = body.alt.trim().slice(0, 280) || null;
  if (typeof body.focal_x === "number")
    update.focal_x = clamp(body.focal_x, 0, 100);
  if (typeof body.focal_y === "number")
    update.focal_y = clamp(body.focal_y, 0, 100);
  if (typeof body.active === "boolean") update.active = body.active;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("page_hero_banners")
    .update(update)
    .eq("page_key", pageKey)
    .select()
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  revalidateTag("page-hero-banners");
  await logAdminAction({
    admin: me,
    action: "page_hero_banner.update",
    targetType: "page_hero_banner",
    targetId: pageKey,
    details: { update },
  });
  return NextResponse.json({ banner: data });
}

/** DELETE — remove the row and the stored object. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  const { pageKey } = await params;
  if (!getSlot(pageKey))
    return NextResponse.json({ error: "unknown_page_key" }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("page_hero_banners")
    .select("storage_path")
    .eq("page_key", pageKey)
    .maybeSingle();
  if (existing?.storage_path) {
    await admin.storage
      .from("page-banners")
      .remove([existing.storage_path])
      .catch(() => undefined);
  }
  const { error } = await admin
    .from("page_hero_banners")
    .delete()
    .eq("page_key", pageKey);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag("page-hero-banners");
  await logAdminAction({
    admin: me,
    action: "page_hero_banner.delete",
    targetType: "page_hero_banner",
    targetId: pageKey,
  });
  return NextResponse.json({ ok: true });
}

function clamp(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}
