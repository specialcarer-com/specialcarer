import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/caregiver/photo?ext=jpg|png|webp
 * Returns a signed-upload URL the client can PUT/POST the file to directly,
 * bypassing Vercel's serverless body-size limit (~4.5 MB).
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const extRaw = (url.searchParams.get("ext") ?? "jpg").toLowerCase();
  const ext = ["jpg", "jpeg", "png", "webp"].includes(extRaw)
    ? extRaw === "jpeg"
      ? "jpg"
      : extRaw
    : "jpg";

  const objectPath = `${user.id}/profile-${Date.now()}.${ext}`;
  const admin = createAdminClient();

  const { data, error } = await admin.storage
    .from("caregiver-photos")
    .createSignedUploadUrl(objectPath);
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create upload URL" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    path: objectPath,
    token: data.token,
    signedUrl: data.signedUrl,
  });
}

/**
 * POST /api/caregiver/photo
 * Body: { path: string }
 * Called after a successful direct upload to confirm the object and persist
 * the public URL on caregiver_profiles.
 *
 * Backwards compatible: if multipart/form-data with a `file` is posted, we
 * accept it and upload server-side (legacy path; subject to ~4.5 MB limit).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const contentType = req.headers.get("content-type") ?? "";

  // ---- New direct-upload confirmation path ----
  if (contentType.includes("application/json")) {
    let body: { path?: string } | null = null;
    try {
      body = (await req.json()) as { path?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const path = body?.path?.trim();
    if (!path || !path.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        { error: "Invalid object path" },
        { status: 400 },
      );
    }

    // Verify the object actually exists in the bucket
    const { data: head, error: headErr } = await admin.storage
      .from("caregiver-photos")
      .createSignedUrl(path, 60);
    if (headErr || !head) {
      return NextResponse.json(
        { error: "Uploaded object not found" },
        { status: 400 },
      );
    }

    const { data: pub } = admin.storage
      .from("caregiver-photos")
      .getPublicUrl(path);
    const photoUrl = pub.publicUrl;

    const { error: upsertErr } = await admin
      .from("caregiver_profiles")
      .upsert(
        {
          user_id: user.id,
          photo_url: photoUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (upsertErr) {
      return NextResponse.json(
        { error: upsertErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, photo_url: photoUrl });
  }

  // ---- Legacy multipart path (kept for compatibility) ----
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Max file size is 5 MB" }, { status: 400 });
  }
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json(
      { error: "Only JPG, PNG, or WebP images allowed" },
      { status: 400 },
    );
  }

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const path = `${user.id}/profile-${Date.now()}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("caregiver-photos")
    .upload(path, buf, {
      contentType: file.type,
      upsert: true,
    });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: pub } = admin.storage
    .from("caregiver-photos")
    .getPublicUrl(path);
  const photoUrl = pub.publicUrl;

  const { error: upsertErr } = await admin
    .from("caregiver_profiles")
    .upsert(
      {
        user_id: user.id,
        photo_url: photoUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, photo_url: photoUrl });
}
