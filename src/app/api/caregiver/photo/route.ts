import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/caregiver/photo
 * multipart/form-data: file=image/(jpeg|png|webp), max 5 MB
 *
 * Uploads the image to the `caregiver-photos` bucket under {userId}/profile.{ext}
 * and updates caregiver_profiles.photo_url with the public URL.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

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

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/profile-${Date.now()}.${ext}`;

  const admin = createAdminClient();

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

  const { data: pub } = admin.storage.from("caregiver-photos").getPublicUrl(path);
  const photoUrl = pub.publicUrl;

  await admin
    .from("caregiver_profiles")
    .upsert(
      {
        user_id: user.id,
        photo_url: photoUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  return NextResponse.json({ ok: true, photo_url: photoUrl });
}
