"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KINDS, MAX_FILE_BYTES, type KindKey } from "@/lib/verification/kinds";

export type ManualItem = {
  kind: KindKey;
  status: "none" | "submitted" | "approved" | "rejected";
  reviewNote: string | null;
};

const BADGE: Record<ManualItem["status"], { text: string; cls: string }> = {
  none: { text: "Not sent", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  submitted: { text: "Awaiting review", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  approved: { text: "Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { text: "Needs changes", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

/** Shrink big phone photos so the upload stays well under the 4MB limit. */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1_500_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function KindForm({ item }: { item: ManualItem }) {
  const router = useRouter();
  const def = KINDS[item.kind];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const src = new FormData(e.currentTarget);
      const body = new FormData();
      body.set("kind", item.kind);
      for (const f of def.fields) {
        const v = src.get(f.key);
        if (f.type === "file") {
          if (v instanceof File && v.size > 0) {
            const small = await shrinkImage(v);
            if (small.size > MAX_FILE_BYTES) {
              setError(`${f.label} is too large. Please use a smaller file (4MB maximum).`);
              return;
            }
            body.set(f.key, small);
          }
        } else if (f.type === "checkbox") {
          body.set(f.key, v ? "true" : "false");
        } else if (typeof v === "string") {
          body.set(f.key, v);
        }
      }
      const res = await fetch("/api/verification/submit", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const badge = BADGE[item.status];
  const canSend = item.status === "none" || item.status === "rejected";
  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{def.label}</p>
          <p className="mt-0.5 text-xs text-slate-600">{def.blurb}</p>
        </div>
        <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs ${badge.cls}`}>{badge.text}</span>
      </div>
      {item.status === "rejected" && item.reviewNote && (
        <p className="mt-2 rounded-lg bg-rose-50 p-2 text-sm text-rose-800">
          From our team: {item.reviewNote}
        </p>
      )}
      {canSend && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-full bg-[#039EA0] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {item.status === "rejected" ? "Send again" : "Add details"}
        </button>
      )}
      {canSend && open && (
        <form onSubmit={onSubmit} className="mt-3 space-y-3">
          {def.fields.map((f) => (
            <label key={f.key} className="block text-sm text-slate-800">
              {f.type === "checkbox" ? (
                <span className="flex items-start gap-2">
                  <input type="checkbox" name={f.key} className="mt-1" />
                  <span>{f.label}</span>
                </span>
              ) : (
                <>
                  {f.label}
                  {f.type === "textarea" ? (
                    <textarea name={f.key} rows={4} className={input} />
                  ) : f.type === "select" ? (
                    <select name={f.key} defaultValue="" className={input}>
                      <option value="" disabled>Choose…</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : f.type === "file" ? (
                    <input
                      type="file"
                      name={f.key}
                      accept={f.accept === "image_or_pdf" ? "image/*,application/pdf" : "image/*"}
                      className={input}
                    />
                  ) : (
                    <input type={f.type === "date" ? "date" : "text"} name={f.key} className={input} autoComplete="off" />
                  )}
                </>
              )}
              {f.help && <span className="mt-0.5 block text-xs text-slate-500">{f.help}</span>}
            </label>
          ))}
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-[#039EA0] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send for review"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-slate-300 px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

export default function ManualVerification({ items }: { items: ManualItem[] }) {
  return (
    <section className="mt-8">
      <h2 className="font-medium">Send your documents for review</h2>
      <p className="mt-1 text-sm text-slate-600">
        Our team checks each item by hand. Your documents are stored securely, only named staff can see them, and photo
        ID is deleted once checked. Items marked as needed to go live are right to work, photo ID and your DBS.
      </p>
      <ul className="mt-4 space-y-3">
        {items.map((i) => (
          <KindForm key={i.kind} item={i} />
        ))}
      </ul>
    </section>
  );
}
