"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Banner = {
  id: string;
  key: string;
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  dismissible: boolean;
};

/**
 * Dismissible top-of-page banner. Reads /api/cms/banners/active and
 * stores dismissal in localStorage keyed on banner.key. Renders nothing
 * if no active banner — the homepage layout is unchanged in that case.
 */
export default function HomeBanner({
  placement = "home_top",
}: {
  placement?: string;
}) {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/cms/banners/active?placement=${encodeURIComponent(placement)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const j = (await res.json()) as { banners?: Banner[] };
        const first = j.banners?.[0] ?? null;
        if (cancelled || !first) return;
        try {
          if (
            first.dismissible &&
            typeof window !== "undefined" &&
            window.localStorage.getItem(`banner.dismissed.${first.key}`) ===
              "1"
          ) {
            setDismissed(true);
          }
        } catch {
          /* ignore localStorage failures */
        }
        setBanner(first);
      } catch {
        /* swallow — homepage must not break */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [placement]);

  if (!banner || dismissed) return null;

  function dismiss() {
    if (!banner) return;
    try {
      window.localStorage.setItem(`banner.dismissed.${banner.key}`, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <section
      role="region"
      aria-label="Site notice"
      className="bg-teal-700 text-white"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-3 text-sm">
        <div className="min-w-0 flex-1">
          <span className="font-semibold">{banner.title}</span>
          {banner.body && (
            <span className="ml-2 opacity-90">{banner.body}</span>
          )}
        </div>
        {banner.cta_label && banner.cta_href && (
          <Link
            href={banner.cta_href}
            className="shrink-0 underline font-semibold"
          >
            {banner.cta_label} →
          </Link>
        )}
        {banner.dismissible && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss banner"
            className="shrink-0 text-white/80 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>
    </section>
  );
}
