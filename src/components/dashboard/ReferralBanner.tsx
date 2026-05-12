"use client";

import { useState } from "react";
import Link from "next/link";

export type ReferralBannerData = {
  code: string;
  shareUrl: string;
  invited: number;
  qualified: number;
  availableCents: number;
};

type Props = {
  data: ReferralBannerData;
  role: "seeker" | "caregiver";
};

const COPY = {
  seeker: {
    headline: "Give £20, get £20",
    sub: "Friends get £20 off their first booking. You get £20 when they complete it.",
  },
  caregiver: {
    headline: "Refer a fellow carer",
    sub: "You both earn £20 when they complete their first paid shift.",
  },
};

/**
 * Referral banner — appears on /dashboard for both roles. Uses brand teal
 * gradient with white text (#FFFFFF on #084C4B-#0B6463 clears 4.5:1 by
 * a wide margin, so the contrast target on the gradient is safe).
 */
export default function ReferralBanner({ data, role }: Props) {
  const copy = COPY[role];
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* user can long-press to copy as fallback */
    }
  };

  const onShare = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: "Join me on SpecialCarer",
          text: "Use my code to get £20 off your first booking.",
          url: data.shareUrl,
        });
        return;
      } catch {
        /* user cancelled or share not allowed — fall back to copy */
      }
    }
    onCopy();
  };

  return (
    <section
      className="mt-8 rounded-2xl text-white p-6 sm:p-8"
      style={{
        background:
          "linear-gradient(135deg, #084C4B 0%, #0B6463 50%, #0E7C7B 100%)",
      }}
      aria-label="Referral programme"
    >
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-md">
          <span
            className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
            style={{ background: "#F4A261", color: "#3F2A14" }}
          >
            £20 / £20
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-semibold">
            {copy.headline}
          </h2>
          <p className="mt-2 text-white/90">{copy.sub}</p>
        </div>

        <div className="flex-1 min-w-[240px] flex flex-col items-stretch gap-2">
          <div
            className="rounded-xl bg-white/10 border border-white/20 p-3 flex items-center justify-between gap-3"
            style={{ backdropFilter: "blur(2px)" }}
          >
            <code
              className="font-mono text-base sm:text-lg font-semibold tracking-wide"
              aria-label="Your referral code"
            >
              {data.code}
            </code>
            <button
              type="button"
              onClick={onCopy}
              className="px-3 py-1.5 rounded-lg bg-white text-brand-700 text-sm font-semibold hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={onShare}
            className="px-4 py-2 rounded-xl bg-white text-brand-700 font-semibold text-sm hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Share your code
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
        <Stat label="Invited" value={String(data.invited)} />
        <Stat label="Qualified" value={String(data.qualified)} />
        <Stat
          label="Available credit"
          value={`£${(data.availableCents / 100).toFixed(2)}`}
          hint="Apply at checkout (coming soon)"
        />
      </div>

      <div className="mt-5">
        <Link
          href="/dashboard/referrals"
          className="text-sm font-semibold underline underline-offset-2 hover:text-white/90"
        >
          See full programme →
        </Link>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "rgba(255,255,255,0.12)" }}
    >
      <div className="text-[11px] uppercase tracking-wide text-white/80">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-white/70">{hint}</div>}
    </div>
  );
}
