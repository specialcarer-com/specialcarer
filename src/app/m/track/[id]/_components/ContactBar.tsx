"use client";

/**
 * Contact bar for the seeker / family viewer of an active booking.
 * Renders three primary actions:
 *   • Call    — tel: deeplink to the carer's phone (fetched lazily)
 *   • Message — link into the existing /m/chat thread
 *   • Share   — generates a tokenised share link for the trip
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "../../../_components/ui";

type ShareState = "idle" | "loading" | "ready" | "error";

export default function ContactBar({
  bookingId,
  role,
}: {
  bookingId: string;
  role: "seeker" | "caregiver";
}) {
  const [phone, setPhone] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareState, setShareState] = useState<ShareState>("idle");

  useEffect(() => {
    if (role === "caregiver") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/carer-phone/${bookingId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { phone?: string | null };
        if (!cancelled) setPhone(json.phone ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, role]);

  async function startShare() {
    if (shareState === "loading") return;
    setShareState("loading");
    try {
      const url = `${window.location.origin}/m/track/${bookingId}/share`;
      // Best-effort native share sheet — falls back to clipboard.
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title: "SpecialCarer trip", url });
        } catch {
          /* user cancelled — that's fine */
        }
      } else if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(url);
      }
      setShareUrl(url);
      setShareState("ready");
    } catch {
      setShareState("error");
    }
  }

  if (role === "caregiver") return null;

  const callDisabled = !phone;

  return (
    <Card className="p-3">
      <div className="grid grid-cols-3 gap-2">
        <a
          href={callDisabled ? undefined : `tel:${phone}`}
          aria-disabled={callDisabled}
          className={`flex flex-col items-center justify-center rounded-btn py-3 text-[12px] font-semibold ${
            callDisabled
              ? "bg-muted text-subheading cursor-not-allowed"
              : "bg-primary-50 text-primary active:bg-primary-100"
          }`}
        >
          <PhoneIcon />
          <span className="mt-1">{callDisabled ? "No phone" : "Call"}</span>
        </a>
        <Link
          href="/m/chat"
          className="flex flex-col items-center justify-center rounded-btn py-3 text-[12px] font-semibold bg-primary-50 text-primary active:bg-primary-100"
        >
          <ChatIcon />
          <span className="mt-1">Message</span>
        </Link>
        <button
          type="button"
          onClick={startShare}
          className="flex flex-col items-center justify-center rounded-btn py-3 text-[12px] font-semibold bg-primary-50 text-primary active:bg-primary-100"
        >
          <ShareIcon />
          <span className="mt-1">
            {shareState === "ready" ? "Copied" : "Share trip"}
          </span>
        </button>
      </div>
      {shareState === "ready" && shareUrl && (
        <p className="mt-2 text-[11px] text-subheading break-all">
          {shareUrl}
        </p>
      )}
    </Card>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      width="20"
      height="20"
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
  );
}
