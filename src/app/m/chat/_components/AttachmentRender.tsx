"use client";
/**
 * P1-B9.1: in-message attachment rendering.
 *
 * Images render as 160x160 rounded thumbnails; tapping opens a full-
 * screen modal viewer with pinch-zoom on touch devices (the browser's
 * native pinch on a full-bleed <img> is enough for v1 — we don't
 * pull in react-native-image-zoom-viewer because the mobile surface
 * is the Capacitor webview, not RN).
 *
 * PDFs render as a cream tile with filename + size; tapping opens
 * the signed URL in a new tab so the OS-native PDF viewer takes over.
 */
import { useState } from "react";
import { formatBytes } from "@/lib/chat/attachments-client";

export type RenderableAttachment = {
  id: string;
  mime_type: string;
  filename: string;
  size_bytes: number;
  width?: number | null;
  height?: number | null;
  signed_url: string | null;
};

export function AttachmentList({
  attachments,
  fromMe,
}: {
  attachments: RenderableAttachment[];
  fromMe?: boolean;
}) {
  if (!attachments.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {attachments.map((a) => (
        <AttachmentItem key={a.id} attachment={a} fromMe={fromMe} />
      ))}
    </div>
  );
}

function AttachmentItem({
  attachment,
  fromMe,
}: {
  attachment: RenderableAttachment;
  fromMe?: boolean;
}) {
  if (attachment.mime_type.startsWith("image/")) {
    return <ImageThumb attachment={attachment} />;
  }
  if (attachment.mime_type === "application/pdf") {
    return <PdfTile attachment={attachment} fromMe={fromMe} />;
  }
  return null;
}

function ImageThumb({ attachment }: { attachment: RenderableAttachment }) {
  const [open, setOpen] = useState(false);
  if (!attachment.signed_url) {
    return (
      <div className="grid h-40 w-40 place-items-center rounded-lg bg-muted text-[12px] text-subheading">
        Image unavailable
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block overflow-hidden rounded-lg"
        aria-label={`Open ${attachment.filename}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.signed_url}
          alt={attachment.filename}
          className="h-40 w-40 object-cover"
        />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.signed_url}
            alt={attachment.filename}
            className="max-h-screen max-w-full object-contain"
            style={{ touchAction: "pinch-zoom" }}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 font-display text-[13px] font-medium text-heading"
            aria-label="Close"
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}

function PdfTile({
  attachment,
  fromMe,
}: {
  attachment: RenderableAttachment;
  fromMe?: boolean;
}) {
  const url = attachment.signed_url;
  const body = (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2.5"
      style={{ backgroundColor: "#F4EFE6", minWidth: 220 }}
    >
      <div
        className="grid h-9 w-9 place-items-center rounded-md"
        style={{ backgroundColor: "#F4A261" }}
        aria-hidden="true"
      >
        <span className="font-display text-[10px] font-semibold text-white">
          PDF
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="truncate font-display text-[13.5px] font-medium"
          style={{ color: "#0F1416" }}
        >
          {attachment.filename}
        </p>
        <p className="font-display text-[11px]" style={{ color: "#575757" }}>
          {formatBytes(attachment.size_bytes)}
        </p>
      </div>
    </div>
  );
  if (!url) return <div aria-disabled>{body}</div>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={fromMe ? "" : ""}
    >
      {body}
    </a>
  );
}
