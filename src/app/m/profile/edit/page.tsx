"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TopBar,
  Avatar,
  Input,
  TextArea,
  Button,
  IconCamera,
} from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Edit profile — including profile photo upload.
 *
 * Photo upload flow:
 *   1. User taps the camera button, native file picker opens. On iOS
 *      (Capacitor WebView) this routes through the system photo
 *      picker / camera via the file input's `accept="image/*"` and
 *      `capture="user"` hints.
 *   2. Client-side guard: reject >5 MB (matches the caregiver-photos
 *      bucket's file_size_limit so we fail fast with a friendly error
 *      instead of waiting for Supabase Storage to reject it).
 *   3. Upload to Supabase Storage bucket `caregiver-photos` at path
 *      `{user_id}/avatar-{timestamp}.{ext}`. The storage RLS policy
 *      `caregiver_photos_owner_write` scopes uploads to the user's own
 *      folder (first path segment must equal auth.uid()). Random
 *      timestamped filename avoids CDN cache stickiness after a
 *      re-upload.
 *   4. Fetch the public URL (bucket is public-read) and store it in
 *      two places:
 *        - `public.profiles.avatar_url` — the canonical, queryable
 *          location used by every screen that renders the user's avatar
 *          (profile page, chat thread header, family sharing list, etc.)
 *        - `auth.user_metadata.avatar_url` — convenience copy so any
 *          client-side code that already has the User object doesn't
 *          need an extra DB round-trip.
 *        - Carers only: also mirror to `caregiver_profiles.photo_url`
 *          so it lights up on the public carer card / search results
 *          without a migration backfill.
 *   5. Show an optimistic preview immediately via URL.createObjectURL
 *      and swap to the uploaded public URL on success so the user
 *      doesn't stare at a spinner after tapping Save.
 *
 * Error handling:
 *   - Any error is surfaced inline as `uploadError` so the user sees
 *     it (previously failures were silent because the button had no
 *     handler at all).
 *   - We keep the form open and the optimistic preview so the user
 *     can retry without re-picking the file.
 */

const AVATAR_BUCKET = "caregiver-photos";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — matches the bucket limit

export default function EditProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    city: "",
    bio: "",
    email: "",
  });

  /* ─── Load current user + profile ─────────────────────────────── */
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const u = userRes.user;
      if (!u) return;
      setUserId(u.id);

      const meta = (u.user_metadata || {}) as Record<string, string>;
      setForm({
        fullName: meta.full_name || meta.name || "",
        phone: meta.phone || "",
        city: meta.city || "",
        bio: meta.bio || "",
        email: u.email || "",
      });

      // Prefer the canonical profiles.avatar_url, fall back to the
      // user_metadata copy if the migration hasn't backfilled yet.
      const { data: prof } = await supabase
        .from("profiles")
        .select("avatar_url, role, full_name")
        .eq("id", u.id)
        .maybeSingle();
      if (prof?.avatar_url) setAvatarUrl(prof.avatar_url);
      else if (meta.avatar_url) setAvatarUrl(meta.avatar_url);
      if (prof?.role) setRole(prof.role);
      if (prof?.full_name && !meta.full_name) {
        setForm((f) => ({ ...f, fullName: prof.full_name as string }));
      }
    })();
  }, []);

  /* ─── Photo upload handler ────────────────────────────────────── */

  function openFilePicker() {
    setUploadError(null);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file twice still fires a
    // change event (browsers dedupe by default).
    e.target.value = "";
    if (!file || !userId) return;

    // Client-side validation.
    if (!file.type.startsWith("image/")) {
      setUploadError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 5 MB. Try a smaller photo.`,
      );
      return;
    }

    setUploadError(null);
    setUploading(true);

    // Optimistic preview.
    const previewUrl = URL.createObjectURL(file);
    const previousAvatar = avatarUrl;
    setAvatarUrl(previewUrl);

    try {
      const supabase = createClient();

      // Keep the extension so the Content-Type served by the CDN
      // matches the file. Fall back to a safe default if the browser
      // reports something weird.
      const extFromName = file.name.split(".").pop()?.toLowerCase();
      const ext =
        extFromName && /^(jpe?g|png|webp)$/.test(extFromName)
          ? extFromName === "jpeg"
            ? "jpg"
            : extFromName
          : file.type === "image/png"
            ? "png"
            : file.type === "image/webp"
              ? "webp"
              : "jpg";

      // Path MUST start with the user id — storage RLS checks that the
      // first folder segment equals auth.uid().
      const objectPath = `${userId}/avatar-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(objectPath, file, {
          contentType: file.type || `image/${ext}`,
          cacheControl: "3600",
          upsert: false,
        });
      if (upErr) throw upErr;

      // Get the public URL (bucket is public-read).
      const { data: pub } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(objectPath);
      const publicUrl = pub.publicUrl;

      // Write to profiles.avatar_url (canonical location).
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);
      if (profErr) throw profErr;

      // Carers: mirror to caregiver_profiles.photo_url so the public
      // carer card and search results also update. We only attempt
      // this for caregiver role; if the row doesn't exist yet (carer
      // hasn't completed onboarding) the update is a no-op.
      if (role === "caregiver") {
        await supabase
          .from("caregiver_profiles")
          .update({ photo_url: publicUrl })
          .eq("user_id", userId);
      }

      // Mirror into user_metadata so the header shown everywhere else
      // in the app picks it up without a DB fetch.
      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });

      setAvatarUrl(publicUrl);
      // Revoke the local preview URL once we've swapped in the real one.
      URL.revokeObjectURL(previewUrl);
    } catch (err: unknown) {
      // Roll back to whatever was showing before (may be null).
      setAvatarUrl(previousAvatar);
      URL.revokeObjectURL(previewUrl);
      const msg =
        err instanceof Error
          ? err.message
          : "Upload failed. Please try again.";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }

  /* ─── Save rest of form ───────────────────────────────────────── */

  async function save() {
    setLoading(true);
    setSaved(false);
    const supabase = createClient();

    const { error: authErr } = await supabase.auth.updateUser({
      data: {
        full_name: form.fullName,
        phone: form.phone,
        city: form.city,
        bio: form.bio,
      },
    });

    // Also write the user-editable fields into public.profiles so
    // they're queryable by other screens and RLS-joined tables.
    if (userId) {
      await supabase
        .from("profiles")
        .update({
          full_name: form.fullName || null,
          phone: form.phone || null,
        })
        .eq("id", userId);
    }

    setLoading(false);
    if (!authErr) {
      setSaved(true);
      setTimeout(() => router.push("/m/profile"), 800);
    }
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <TopBar title="Edit profile" back="/m/profile" />

      {/* Avatar with camera-pill overlay */}
      <div className="flex flex-col items-center pt-2">
        <div className="relative">
          <Avatar
            size={96}
            src={avatarUrl || undefined}
            name={form.fullName || "?"}
          />

          {/* Hidden file input driven by the camera button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          <button
            type="button"
            onClick={openFilePicker}
            disabled={uploading || !userId}
            className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-primary text-white shadow-card disabled:opacity-50"
            aria-label={
              uploading ? "Uploading photo…" : "Change profile photo"
            }
          >
            {uploading ? (
              // Inline spinner — matches the teal button and spins
              // inside the 36×36 bubble without layout shift.
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
            ) : (
              <IconCamera />
            )}
          </button>
        </div>

        {uploading && (
          <p className="mt-2 text-[12px] text-subheading">Uploading photo…</p>
        )}
        {uploadError && (
          <p
            role="alert"
            className="mt-2 max-w-[280px] text-center text-[12px] text-[#D9534F]"
          >
            {uploadError}
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-4 px-5">
        <Input
          label="Full name"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <Input
          label="Email"
          value={form.email}
          disabled
          hint="Contact support to change your email"
        />
        <Input
          label="Phone"
          inputMode="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <Input
          label="City"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <TextArea
          label="About me"
          rows={5}
          placeholder="Tell families about your experience and approach to care."
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <Button block onClick={save} disabled={loading || uploading}>
          {loading ? "Saving…" : saved ? "Saved" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
