"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  TopBar,
  BottomNav,
  Button,
  TextArea,
  Card,
  IconCamera,
} from "../../_components/ui";
import {
  JOURNAL_KINDS,
  JOURNAL_KIND_LABEL,
  JOURNAL_MOODS,
  JOURNAL_MOOD_EMOJI,
  JOURNAL_MOOD_LABEL,
  JOURNAL_MAX_BODY,
  JOURNAL_MAX_PHOTOS,
  type JournalKind,
  type JournalMood,
} from "@/lib/journal/types";

const PHOTOS_BUCKET = "journal-photos";
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB per photo — covers most phone shots

type StagedPhoto = {
  /** Storage object path written to the bucket. */
  path: string;
  /** Local preview URL (object URL, revoked on submit/cancel). */
  previewUrl: string;
};

export default function NewJournalEntryPage() {
  // useSearchParams forces this tree onto the client at runtime; wrapping in
  // Suspense satisfies Next 15's prerender requirement.
  return (
    <Suspense fallback={<NewJournalSkeleton />}>
      <NewJournalForm />
    </Suspense>
  );
}

function NewJournalSkeleton() {
  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="New journal note" back="/m/journal" />
      <div className="px-4 pt-3 space-y-4">
        <div className="h-24 rounded-card bg-white shadow-card" />
        <div className="h-24 rounded-card bg-white shadow-card" />
        <div className="h-40 rounded-card bg-white shadow-card" />
      </div>
      <BottomNav active="home" />
    </main>
  );
}

function NewJournalForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const bookingId = sp.get("bookingId");
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<JournalKind>("note");
  const [mood, setMood] = useState<JournalMood | null>(null);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const remaining = JOURNAL_MAX_BODY - body.length;
  const photoSlotsLeft = JOURNAL_MAX_PHOTOS - photos.length;

  const onPickFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);
      setUploading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setError("Please sign in again before adding photos.");
          return;
        }

        const tempEntryFolder = crypto.randomUUID();
        const newPhotos: StagedPhoto[] = [];
        const slots = Math.min(files.length, photoSlotsLeft);

        for (let i = 0; i < slots; i++) {
          const f = files.item(i);
          if (!f) continue;
          if (!ACCEPTED_TYPES.includes(f.type)) {
            setError("Photos must be JPG, PNG, WebP or HEIC.");
            continue;
          }
          if (f.size > MAX_PHOTO_BYTES) {
            setError("Each photo must be 8MB or smaller.");
            continue;
          }
          // Sanitise filename — preserve extension, replace anything risky.
          const ext = (f.name.split(".").pop() || "jpg")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
            .slice(0, 5) || "jpg";
          const path = `${user.id}/${tempEntryFolder}/${crypto.randomUUID()}.${ext}`;

          const { error: uploadErr } = await supabase.storage
            .from(PHOTOS_BUCKET)
            .upload(path, f, {
              cacheControl: "3600",
              upsert: false,
              contentType: f.type,
            });
          if (uploadErr) {
            console.error("[journal] upload error", uploadErr);
            setError("One of the photos couldn't be uploaded. Please try again.");
            continue;
          }

          newPhotos.push({
            path,
            previewUrl: URL.createObjectURL(f),
          });
        }

        if (newPhotos.length > 0) {
          setPhotos((prev) => [...prev, ...newPhotos]);
        }
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [photoSlotsLeft, supabase],
  );

  const removePhoto = useCallback(
    async (idx: number) => {
      const p = photos[idx];
      if (!p) return;
      // Revoke preview + best-effort remove from storage. RLS allows the
      // author to delete their own objects.
      URL.revokeObjectURL(p.previewUrl);
      void supabase.storage.from(PHOTOS_BUCKET).remove([p.path]);
      setPhotos((prev) => prev.filter((_, i) => i !== idx));
    },
    [photos, supabase],
  );

  const onSubmit = useCallback(async () => {
    if (submitting || uploading) return;
    setError(null);

    const trimmed = body.trim();
    if (!trimmed) {
      setError("Please add a note before saving.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: trimmed,
          kind,
          mood,
          bookingId: bookingId ?? null,
          photoPaths: photos.map((p) => p.path),
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        entryId?: string;
      };

      if (!res.ok) {
        setError(json.error ?? "Couldn't save your note. Please try again.");
        setSubmitting(false);
        return;
      }

      // Revoke any local preview URLs we created.
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));

      // After save, take the user back to the timeline.
      router.replace("/m/journal");
      router.refresh();
    } catch (e) {
      console.error("[journal] submit failed", e);
      setError("Network problem — please try again.");
      setSubmitting(false);
    }
  }, [body, bookingId, kind, mood, photos, router, submitting, uploading]);

  const onCancel = useCallback(() => {
    // Best-effort cleanup of any uploaded-but-unsaved photos.
    if (photos.length > 0) {
      void supabase.storage
        .from(PHOTOS_BUCKET)
        .remove(photos.map((p) => p.path));
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    }
    router.back();
  }, [photos, router, supabase]);

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar
        title="New journal note"
        back={onCancel}
        right={
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || uploading || !body.trim()}
            className="text-primary font-bold text-[14px] disabled:text-subheading"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        }
      />

      <div className="px-4 pt-3 pb-8 space-y-4">
        {/* Kind picker */}
        <Card>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-subheading mb-2">
            What's this about?
          </p>
          <div className="flex flex-wrap gap-2">
            {JOURNAL_KINDS.map((k) => {
              const active = k === kind;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`h-9 px-3 rounded-pill border text-[13px] font-medium transition sc-no-select ${
                    active
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-heading border-line"
                  }`}
                >
                  {JOURNAL_KIND_LABEL[k]}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Mood picker (optional) */}
        <Card>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-subheading mb-2">
            Mood (optional)
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMood(null)}
              className={`h-9 px-3 rounded-pill border text-[13px] font-medium transition sc-no-select ${
                mood === null
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-heading border-line"
              }`}
            >
              No mood
            </button>
            {JOURNAL_MOODS.map((m) => {
              const active = m === mood;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMood(m)}
                  className={`h-9 px-3 rounded-pill border text-[13px] font-medium transition sc-no-select inline-flex items-center gap-1 ${
                    active
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-heading border-line"
                  }`}
                >
                  <span aria-hidden>{JOURNAL_MOOD_EMOJI[m]}</span>
                  {JOURNAL_MOOD_LABEL[m]}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Body */}
        <Card>
          <TextArea
            label="What happened?"
            placeholder="A short note about the visit — what went well, what to flag…"
            rows={6}
            maxLength={JOURNAL_MAX_BODY}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <p className="mt-1.5 text-[11px] text-subheading text-right">
            {remaining} characters left
          </p>
        </Card>

        {/* Photos */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-subheading">
              Photos
            </p>
            <span className="text-[11px] text-subheading">
              {photos.length}/{JOURNAL_MAX_PHOTOS}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div
                key={p.path}
                className="relative aspect-square rounded-lg overflow-hidden bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.previewUrl}
                  alt="Selected photo"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  aria-label="Remove photo"
                  className="absolute top-1 right-1 grid place-items-center w-7 h-7 rounded-full bg-black/55 text-white text-[14px] font-bold sc-no-select"
                >
                  ×
                </button>
              </div>
            ))}

            {photoSlotsLeft > 0 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="aspect-square rounded-lg border-2 border-dashed border-line bg-white grid place-items-center text-subheading hover:border-primary hover:text-primary transition disabled:opacity-50 sc-no-select"
                aria-label="Add photo"
              >
                <span className="flex flex-col items-center gap-1 text-[11px] font-medium">
                  <IconCamera />
                  {uploading ? "Uploading…" : "Add"}
                </span>
              </button>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
        </Card>

        {bookingId && (
          <p className="text-[12px] text-subheading text-center">
            Linked to booking · only the booking parties can read this note.
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-card border border-[#E5B3B3] bg-[#FBEBEB] px-4 py-3 text-[13px] text-[#A33]"
          >
            {error}
          </div>
        )}

        <Button
          block
          onClick={onSubmit}
          disabled={submitting || uploading || !body.trim()}
        >
          {submitting ? "Saving…" : "Save note"}
        </Button>
      </div>

      <BottomNav active="home" />
    </main>
  );
}
