"use client";

import { useState } from "react";
import ShareProfileModal from "./ShareProfileModal";

const TEAL = "#039EA0";

type Props = {
  url: string;
  name: string;
  /** Visual style: "primary" solid teal, or "soft" tinted pill (mobile). */
  variant?: "primary" | "soft";
  className?: string;
};

/**
 * "Share my profile" CTA. Uses the native Web Share sheet when available
 * (mobile), otherwise opens a fallback modal with copy-link, social deep
 * links, and a QR code. Render only when the carer is publish-ready.
 */
export default function ShareProfileButton({
  url,
  name,
  variant = "primary",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);

  async function onClick() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "My SpecialCarers profile",
          text: `Check out ${name}'s caregiver profile on SpecialCarers.`,
          url,
        });
        return;
      } catch {
        // User dismissed or share failed — fall through to the modal.
      }
    }
    setOpen(true);
  }

  const base =
    "inline-flex h-10 items-center justify-center gap-2 rounded-btn px-4 text-[14px] font-bold transition";
  const style =
    variant === "primary"
      ? { background: TEAL, color: "#fff" }
      : { background: "rgba(3,158,160,0.12)", color: TEAL };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={`${base} ${className}`}
        style={style}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share my profile
      </button>
      {open && (
        <ShareProfileModal url={url} name={name} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
