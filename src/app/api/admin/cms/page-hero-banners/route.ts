import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSlot } from "@/lib/page-banners/registry";

export const dynamic = "force-dynamic";

/** GET — list every existing banner row. */
export async function GET() {
  const _adminGuard = await requireAdminApi();

  if (!_adminGuard.ok) return _adminGuard.response;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("page_hero_banners")
    .select(
      "page_key, media_url, media_kind, alt, focal_x, focal_y, poster_url, storage_path, active, updated_at",
    );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ banners: data ?? [] });
}

/**
 * POST multipart/form-data
 *   page_key        — string, must exist in the registry
 *   file            — image/* or video/*
 *   alt             — optional string
 *   focal_x         — optional 0–100 (default 50)
 *   focal_y         — optional 0–100 (default 50)
 *   active          — optional "true"|"false" (default true)
 *
 * Replaces the row at page_key, replacing any existing storage object.
 */
export async function POST(req: Request) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  const form = await req.formData().catch(() => null);
  if (!form)
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });

  const pageKey = String(form.get("page_key") ?? "").trim();
  const slot = getSlot(pageKey);
  if (!slot)
    return NextResponse.json({ error: "unknown_page_key" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: "unsupported_mime", mime: file.type },
      { status: 400 },
    );
  }
  const mediaKind = isImage ? "image" : "video";

  // Validate focal point + active
  const focalX = clamp(parseInt(String(form.get("focal_x") ?? "50"), 10), 0, 100);
  const focalY = clamp(parseInt(String(form.get("focal_y") ?? "50"), 10), 0, 100);
  const altRaw = form.get("alt");
  const alt = typeof altRaw === "string" ? altRaw.trim().slice(0, 280) : null;
  const activeRaw = String(form.get("active") ?? "true");
  const active = activeRaw === "true";

  const admin = createAdminClient();

  // If a row already exists with a stored object, remove the old object first.
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

  // Upload the new object
  const ext = (file.name.split(".").pop() || (isImage ? "jpg" : "mp4"))
    .toLowerCase()
    .slice(0, 6);
  const path = `${pageKey.replace(/\./g, "/")}/${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from("page-banners")
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: true,
    });
  if (upErr)
    return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = admin.storage.from("page-banners").getPublicUrl(path);
  const mediaUrl = pub.publicUrl;

  // Upsert the row
  const { data: row, error: dbErr } = await admin
    .from("page_hero_banners")
    .upsert({
      page_key: pageKey,
      media_url: mediaUrl,
      media_kind: mediaKind,
      alt,
      focal_x: focalX,
      focal_y: focalY,
      storage_path: path,
      active,
      updated_at: new Date().toISOString(),
      updated_by: me.id,
    })
    .select()
    .single();
  if (dbErr)
    return NextResponse.json({ error: dbErr.message }, { status: 500 });

  revalidateTag("page-hero-banners");
  await logAdminAction({
    admin: me,
    action: "page_hero_banner.upload",
    targetType: "page_hero_banner",
    targetId: pageKey,
    details: { media_kind: mediaKind, path },
  });

  return NextResponse.json({ banner: row });
}

function clamp(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}
