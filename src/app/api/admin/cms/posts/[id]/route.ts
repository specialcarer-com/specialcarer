import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CMS_POST_STATUSES } from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _adminGuard = await requireAdminApi();

  if (!_adminGuard.ok) return _adminGuard.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cms_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ post: data });
}

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
  if (typeof p.title === "string") update.title = p.title.trim();
  if (typeof p.slug === "string") update.slug = p.slug.trim();
  if (typeof p.body_md === "string") update.body_md = p.body_md;
  if (typeof p.excerpt === "string") update.excerpt = p.excerpt.slice(0, 500);
  if (typeof p.hero_image_url === "string" || p.hero_image_url === null) {
    update.hero_image_url = p.hero_image_url ?? null;
  }
  if (
    typeof p.status === "string" &&
    (CMS_POST_STATUSES as readonly string[]).includes(p.status)
  ) {
    update.status = p.status;
    if (p.status === "published") {
      update.published_at = new Date().toISOString();
    }
  }
  if (Array.isArray(p.audience))
    update.audience = p.audience.filter(
      (x): x is string => typeof x === "string",
    );
  if (Array.isArray(p.tags))
    update.tags = p.tags.filter((x): x is string => typeof x === "string");
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cms_posts")
    .update(update)
    .eq("id", id)
    .select("id, slug, status")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 },
    );
  }
  await logAdminAction({
    admin: me,
    action: "cms_post.update",
    targetType: "cms_post",
    targetId: id,
    details: update,
  });
  return NextResponse.json({ post: data });
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
  // Soft-delete: archive rather than drop the row.
  const { error } = await admin
    .from("cms_posts")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await logAdminAction({
    admin: me,
    action: "cms_post.archive",
    targetType: "cms_post",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
