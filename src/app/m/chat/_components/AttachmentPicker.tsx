"use client";
/**
 * P1-B9.1: attachment picker — paperclip button + bottom sheet with
 * "Photo from library" and "Document (PDF)" actions.
 *
 * Inside the mobile webview, the system file picker is the right
 * primitive: <input accept="..."> respects iOS/Android photo and
 * document pickers. (The brief calls out expo-image-picker /
 * expo-document-picker, but the actual mobile surface here is a
 * Capacitor-hosted Next.js webview, not an Expo RN app — so we use
 * the web pickers that the webview proxies through to the OS.)
 */
import { useRef, useState } from "react";
import { IconPaperclip } from "./IconPaperclip";
import {
  ALLOWED_MIME,
  type AllowedMime,
  validateSelection,
} from "@/lib/chat/attachments-client";

export type SelectedFile = {
  blob: Blob;
  filename: string;
  mime_type: AllowedMime;
  size_bytes: number;
  width?: number;
  height?: number;
};

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const PDF_ACCEPT = "application/pdf";

async function measureImage(
  blob: Blob,
): Promise<{ width: number; height: number } | null> {
  if (typeof window === "undefined") return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export function AttachmentPicker(props: {
  /** How many attachments are already on the current draft. */
  existingCount: number;
  onSelected: (file: SelectedFile) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const mime = file.type;
    if (!(ALLOWED_MIME as readonly string[]).includes(mime)) {
      props.onError("That file type isn't supported.");
      return;
    }
    const validation = validateSelection(
      { mime_type: mime, size_bytes: file.size },
      props.existingCount,
    );
    if (!validation.ok) {
      const msg =
        validation.reason === "size"
          ? "File is larger than 10 MB."
          : validation.reason === "count"
            ? "Max 5 files per message."
            : "That file type isn't supported.";
      props.onError(msg);
      return;
    }
    const dims = mime.startsWith("image/") ? await measureImage(file) : null;
    props.onSelected({
      blob: file,
      filename: file.name,
      mime_type: mime as AllowedMime,
      size_bytes: file.size,
      width: dims?.width,
      height: dims?.height,
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={props.disabled}
        aria-label="Add attachment"
        className="grid h-11 w-11 place-items-center rounded-full text-heading transition active:scale-95 disabled:text-subheading"
      >
        <IconPaperclip />
      </button>

      <input
        ref={imgRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={pdfRef}
        type="file"
        accept={PDF_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-white p-4 pb-8 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <p className="px-2 pb-2 font-display text-[15px] font-medium text-heading">
              Add to message
            </p>
            <button
              type="button"
              className="w-full rounded-2xl bg-muted px-4 py-3 text-left font-display text-[15px] font-medium text-heading active:bg-line"
              onClick={() => {
                setOpen(false);
                imgRef.current?.click();
              }}
            >
              Photo from library
            </button>
            <div className="h-2" />
            <button
              type="button"
              className="w-full rounded-2xl bg-muted px-4 py-3 text-left font-display text-[15px] font-medium text-heading active:bg-line"
              onClick={() => {
                setOpen(false);
                pdfRef.current?.click();
              }}
            >
              Document (PDF)
            </button>
            <div className="h-2" />
            <button
              type="button"
              className="w-full rounded-2xl px-4 py-3 text-center font-display text-[14px] text-subheading"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
