import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CMS_BANNER_PLACEMENTS,
  type CmsBannerPlacement,
} from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const _adminGuard = await requireAdminApi();

  if (!_adminGuard.ok) return _adminGuard.response;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cms_banners")
    .select(
      "id, key, title, body, cta_label, cta_href, audience, placement, starts_at, ends_at, active, dismissible, updated_at",
    )
    .order("updated_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ banners: data ?? [] });
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
  const key = typeof p.key === "string" ? p.key.trim() : "";
  const title = typeof p.title === "string" ? p.title.trim() : "";
  const placement = p.placement;
  if (!key || !title) {
    return NextResponse.json(
      { error: "missing_key_or_title" },
      { status: 400 },
    );
  }
  if (
    typeof placement !== "string" ||
    !(CMS_BANNER_PLACEMENTS as readonly string[]).includes(placement)
  ) {
    return NextResponse.json(
      { error: "invalid_placement" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cms_banners")
    .insert({
      key,
      title,
      body: typeof p.body === "string" ? p.body : null,
      cta_label: typeof p.cta_label === "string" ? p.cta_label : null,
      cta_href: typeof p.cta_href === "string" ? p.cta_href : null,
      audience: Array.isArray(p.audience)
        ? p.audience.filter((x): x is string => typeof x === "string")
        : [],
      placement: placement as CmsBannerPlacement,
      starts_at: typeof p.starts_at === "string" ? p.starts_at : null,
      ends_at: typeof p.ends_at === "string" ? p.ends_at : null,
      active: typeof p.active === "boolean" ? p.active : false,
      dismissible:
        typeof p.dismissible === "boolean" ? p.dismissible : true,
    })
    .select("id, key, placement, active")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  await logAdminAction({
    admin: me,
    action: "cms_banner.create",
    targetType: "cms_banner",
    targetId: data.id,
    details: { key, placement },
  });
  return NextResponse.json({ banner: data });
}
