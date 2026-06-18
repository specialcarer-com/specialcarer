"use client";

import * as React from "react";
import Link from "next/link";

/**
 * Post Job FAB (PR-R4, flag-gated by the caller).
 *
 * In the redesign the seeker bottom-tab loses its "Post Job" tab; posting a
 * job moves to this floating action button on the Bookings screen. The /m/post-job
 * route still exists as the destination — this is just the new entry point.
 *
 * Brand peach (#F4A261) — the redesign's accent colour, used here for the
 * first time on a primary action. Sits bottom-right, above the bottom nav,
 * clear of the iOS home-indicator safe area.
 */
export default function PostJobFab({ href = "/m/post-job" }: { href?: string }) {
  return (
    <Link
      href={href}
      role="button"
      aria-label="Post a new job"
      className="fixed right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-card-md sc-no-select active:scale-95 transition-transform"
      style={{
        // 16px above the bottom nav, itself lifted by the home-indicator safe area.
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </Link>
  );
}
