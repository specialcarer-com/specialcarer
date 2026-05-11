import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CMS_POST_STATUSES,
  type CmsPostStatus,
} from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const _adminGuard = await requireAdminApi();

  if (!_adminGuard.ok) return _adminGuard.response;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cms_posts")
    .select(
      "id, slug, title, excerpt, status, hero_image_url, published_at, audience, tags, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(req: Request) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const slug = typeof p.slug === "string" ? p.slug.trim() : "";
  const title = typeof p.title === "string" ? p.title.trim() : "";
  const bodyMd = typeof p.body_md === "string" ? p.body_md : "";
  const excerpt =
    typeof p.excerpt === "string" ? p.excerpt.trim().slice(0, 500) : null;
  const heroUrl =
    typeof p.hero_image_url === "string" ? p.hero_image_url : null;
  const status =
    typeof p.status === "string" &&
    (CMS_POST_STATUSES as readonly string[]).includes(p.status)
      ? (p.status as CmsPostStatus)
      : "draft";
  const audience = Array.isArray(p.audience)
    ? p.audience.filter((x): x is string => typeof x === "string")
    : [];
  const tags = Array.isArray(p.tags)
    ? p.tags.filter((x): x is string => typeof x === "string")
    : [];

  if (!slug || !title) {
    return NextResponse.json(
      { error: "missing_slug_or_title" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cms_posts")
    .insert({
      slug,
      title,
      body_md: bodyMd,
      excerpt,
      hero_image_url: heroUrl,
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
      audience,
      tags,
      author_id: me.id,
    })
    .select("id, slug")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  await logAdminAction({
    admin: me,
    action: "cms_post.create",
    targetType: "cms_post",
    targetId: data.id,
    details: { slug, title, status },
  });
  return NextResponse.json({ post: data });
}
