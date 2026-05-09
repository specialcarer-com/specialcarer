"use client";

/**
 * Carer photo gallery editor. Up to 6 photos, drag-and-drop to
 * reorder, inline caption edit, delete (best-effort storage cleanup).
 *
 * Photos are stored in the existing `caregiver-photos` bucket under
 * the carer's own folder (`{uid}/gallery/...`) — this matches the
 * existing storage RLS policy that scopes writes to `auth.uid()` as
 * the first folder segment.
 */

import { useEffect, useRef, useState } from "react";
import {
  TopBar,
  Button,
  IconCamera,
  IconPlus,
  IconTrash,
} from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "caregiver-photos";
const MAX_PHOTOS = 6;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

type Photo = {
  id: string;
  storage_path: string;
  public_url: string;
  caption: string | null;
  sort_order: number;
};

export default function PhotosPage() {
  const supabase = createClient();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  async function refresh() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUserId(null);
      setPhotos([]);
      setErr("Sign in to manage your gallery.");
      return;
    }
    setUserId(user.id);
    const { data, error } = await supabase
      .from("caregiver_photos")
      .select("id, storage_path, public_url, caption, sort_order")
      .eq("caregiver_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      setErr(error.message);
      setPhotos([]);
      return;
    }
    setPhotos((data ?? []) as Photo[]);
    setErr(null);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickFile(file: File) {
    if (!userId) return;
    if (!file.type.startsWith("image/")) {
      setErr("Photos must be image files.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr("File is larger than 5MB.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `${userId}/gallery/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: file.type || `image/${ext}`,
          cacheControl: "3600",
          upsert: false,
        });
      if (upErr) {
        setErr(upErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const nextSort = (photos?.length ?? 0) + 1;
      const { error: insErr } = await supabase.from("caregiver_photos").insert({
        caregiver_id: userId,
        storage_path: path,
        public_url: pub.publicUrl,
        sort_order: nextSort,
      });
      if (insErr) {
        // Most likely the trigger fired on the 7th attempt; surface
        // the message verbatim.
        setErr(insErr.message);
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateCaption(id: string, caption: string) {
    setPhotos((prev) =>
      prev?.map((p) => (p.id === id ? { ...p, caption } : p)) ?? prev,
    );
    await supabase
      .from("caregiver_photos")
      .update({ caption: caption || null })
      .eq("id", id);
  }

  async function remove(id: string) {
    if (!confirm("Remove this photo?")) return;
    const target = photos?.find((p) => p.id === id);
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase
        .from("caregiver_photos")
        .delete()
        .eq("id", id);
      if (error) {
        setErr(error.message);
        return;
      }
      // Best-effort storage cleanup.
      if (target?.storage_path) {
        await supabase.storage
          .from(BUCKET)
          .remove([target.storage_path])
          .catch(() => undefined);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function persistOrder(rows: Photo[]) {
    // Optimistic update first; then PATCH each changed sort_order
    // serially. Server trigger doesn't fire on update so this is safe.
    setPhotos(rows.map((p, i) => ({ ...p, sort_order: i + 1 })));
    for (let i = 0; i < rows.length; i += 1) {
      const p = rows[i];
      if (p.sort_order !== i + 1) {
        await supabase
          .from("caregiver_photos")
          .update({ sort_order: i + 1 })
          .eq("id", p.id);
      }
    }
  }

  function onDragStart(id: string) {
    setDraggingId(id);
  }
  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }
  async function onDrop(targetId: string) {
    if (!draggingId || !photos || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    const fromIdx = photos.findIndex((p) => p.id === draggingId);
    const toIdx = photos.findIndex((p) => p.id === targetId);
    if (fromIdx < 0 || toIdx < 0) {
      setDraggingId(null);
      return;
    }
    const next = [...photos];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setDraggingId(null);
    await persistOrder(next);
  }

  if (photos === null) {
    return (
      <div className="min-h-screen bg-bg-screen pb-12">
        <TopBar title="Gallery" back="/m/profile" />
        <p className="px-5 pt-6 text-center text-sm text-subheading">
          Loading…
        </p>
      </div>
    );
  }

  const canAdd = photos.length < MAX_PHOTOS;

  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <TopBar title="Gallery" back="/m/profile" />
      <div className="px-5 pt-3 space-y-3">
        <p className="text-[12px] text-subheading">
          Up to {MAX_PHOTOS} photos. Drag to reorder. Photos appear on your
          public profile.
        </p>
        {err && <p className="text-[12px] text-rose-700">{err}</p>}

        <div className="grid grid-cols-2 gap-3">
          {photos.map((p) => (
            <div
              key={p.id}
              draggable
              onDragStart={() => onDragStart(p.id)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(p.id)}
              className={`rounded-card bg-white shadow-card overflow-hidden border ${
                draggingId === p.id ? "border-primary" : "border-line"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.public_url}
                alt={p.caption ?? "Gallery photo"}
                className="aspect-square w-full object-cover bg-muted"
              />
              <div className="p-2 space-y-2">
                <input
                  type="text"
                  defaultValue={p.caption ?? ""}
                  placeholder="Caption (optional)"
                  onBlur={(e) =>
                    void updateCaption(p.id, e.target.value.slice(0, 160))
                  }
                  className="w-full rounded-lg border border-line bg-white px-2 py-1 text-[12px] text-heading"
                />
                <div className="flex items-center justify-between text-[11px] text-subheading">
                  <span>Drag to reorder</span>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="grid h-7 w-7 place-items-center rounded-full bg-muted text-subheading"
                    aria-label="Delete"
                    disabled={busy}
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {canAdd && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || !userId}
              className="flex flex-col items-center justify-center gap-2 aspect-square rounded-card border-2 border-dashed border-line bg-white text-subheading"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-50 text-primary">
                <IconCamera />
              </span>
              <span className="text-[12px] font-semibold">
                {busy ? "Uploading…" : "Add photo"}
              </span>
            </button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickFile(f);
            e.target.value = "";
          }}
        />

        {!canAdd && (
          <p className="text-center text-[11px] text-subheading">
            Gallery is full ({MAX_PHOTOS}/{MAX_PHOTOS}). Remove one to add another.
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <Button
          block
          onClick={() => fileRef.current?.click()}
          disabled={!canAdd || busy || !userId}
        >
          <span className="inline-flex items-center justify-center gap-2">
            <IconPlus /> Add photo
          </span>
        </Button>
      </div>
    </div>
  );
}
