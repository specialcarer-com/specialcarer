"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { PageBannerSlot } from "@/lib/page-banners/registry";

type Initial = {
  page_key: string;
  media_url: string;
  media_kind: "image" | "video";
  alt: string | null;
  focal_x: number;
  focal_y: number;
  poster_url: string | null;
  storage_path: string | null;
  active: boolean;
  updated_at: string;
} | null;

export default function PageBannerRow({
  slot,
  initial,
}: {
  slot: PageBannerSlot;
  initial: Initial;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [media, setMedia] = useState(initial);
  const [alt, setAlt] = useState(initial?.alt ?? "");
  const [focalX, setFocalX] = useState(initial?.focal_x ?? 50);
  const [focalY, setFocalY] = useState(initial?.focal_y ?? 50);
  const [active, setActive] = useState(initial?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const form = new FormData();
      form.set("page_key", slot.key);
      form.set("file", file);
      form.set("alt", alt);
      form.set("focal_x", String(focalX));
      form.set("focal_y", String(focalY));
      form.set("active", String(active));
      const res = await fetch("/api/admin/cms/page-hero-banners", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? `Upload failed (${res.status})`);
        return;
      }
      const json = (await res.json()) as { banner: NonNullable<Initial> };
      setMedia(json.banner);
      setInfo("Uploaded");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveMeta() {
    if (!media) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const res = await fetch(
        `/api/admin/cms/page-hero-banners/${encodeURIComponent(slot.key)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alt: alt || null,
            focal_x: focalX,
            focal_y: focalY,
            active,
          }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? `Save failed (${res.status})`);
        return;
      }
      const json = (await res.json()) as { banner: NonNullable<Initial> };
      setMedia(json.banner);
      setInfo("Saved");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!media) return;
    if (!confirm(`Remove banner from ${slot.label}?`)) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const res = await fetch(
        `/api/admin/cms/page-hero-banners/${encodeURIComponent(slot.key)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? `Delete failed (${res.status})`);
        return;
      }
      setMedia(null);
      setInfo("Removed");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* Preview */}
      <div className="relative aspect-[16/7] bg-slate-100">
        {media?.media_kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.media_url}
            alt={alt || slot.defaultAlt}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `${focalX}% ${focalY}%` }}
          />
        )}
        {media?.media_kind === "video" && (
          <video
            src={media.media_url}
            poster={media.poster_url ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `${focalX}% ${focalY}%` }}
          />
        )}
        {!media && (
          <div
            className="absolute inset-0"
            style={{ background: slot.fallbackGradient }}
          />
        )}
        {/* focal point pin */}
        {media && (
          <div
            aria-hidden
            className="absolute h-4 w-4 rounded-full border-2 border-white shadow"
            style={{
              left: `calc(${focalX}% - 8px)`,
              top: `calc(${focalY}% - 8px)`,
              background: "rgba(14,124,123,0.9)",
            }}
          />
        )}
        {!media && (
          <div className="absolute inset-0 grid place-items-center text-white text-xs font-semibold uppercase tracking-wide">
            No media uploaded
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900">{slot.label}</p>
            <p className="mt-0.5 text-xs text-slate-500 font-mono">
              {slot.key}
            </p>
            <Link
              href={slot.path}
              target="_blank"
              className="mt-1 inline-block text-xs font-semibold text-teal-700 hover:underline"
            >
              View page ↗
            </Link>
          </div>
          {media && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold whitespace-nowrap ${
                active
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {active ? "Live" : "Hidden"}
            </span>
          )}
        </div>

        {/* Upload control */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <button
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            {busy ? "Working…" : media ? "Replace media" : "Upload media"}
          </button>
          {media && (
            <button
              disabled={busy}
              onClick={remove}
              className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 text-sm font-semibold disabled:opacity-60"
            >
              Remove
            </button>
          )}
          <span className="text-xs text-slate-500">
            JPG / PNG / WebP / MP4 — up to ~100 MB.
          </span>
        </div>

        {/* Metadata editors (only useful when media exists) */}
        {media && (
          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            <label className="text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Alt text
              </span>
              <input
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder={slot.defaultAlt}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Visibility
              </span>
              <select
                value={active ? "true" : "false"}
                onChange={(e) => setActive(e.target.value === "true")}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="true">Live</option>
                <option value="false">Hidden (use fallback)</option>
              </select>
            </label>
            <label className="text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Focal point — horizontal ({focalX}%)
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={focalX}
                onChange={(e) => setFocalX(parseInt(e.target.value, 10))}
                className="w-full"
              />
            </label>
            <label className="text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Focal point — vertical ({focalY}%)
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={focalY}
                onChange={(e) => setFocalY(parseInt(e.target.value, 10))}
                className="w-full"
              />
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <button
                onClick={saveMeta}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}

        {err && (
          <p aria-live="polite" className="text-sm text-rose-700">
            {err}
          </p>
        )}
        {info && (
          <p aria-live="polite" className="text-sm text-emerald-700">
            {info}
          </p>
        )}
      </div>
    </article>
  );
}
