"use client";

import { useEffect, useState } from "react";
import type { BannerVariant } from "@/lib/page-banners/get";

const COOKIE_DAYS = 90;

function cookieNameFor(pageKey: string): string {
  return `sc_banner_${pageKey.replace(/\./g, "_")}`;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function writeCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

type Props = {
  pageKey: string;
  variants: BannerVariant[];
  /** Variant index chosen by SSR. */
  ssrIndex: number;
  /** True when SSR could not read a cookie and the client should randomise. */
  needsClientPick: boolean;
};

/**
 * Sticky-per-visit variant picker.
 *
 * On mount:
 *   - If a cookie exists with a valid index, render that variant (and update
 *     state if SSR fell back to 0).
 *   - Else, pick a random index, write the cookie, and re-render to show it.
 *
 * Returns the same DOM structure as SSR (single <img>) so React hydrates
 * cleanly. After mount the src/alt/object-position can swap to the chosen
 * variant.
 */
export default function BannerVariantPicker({
  pageKey,
  variants,
  ssrIndex,
  needsClientPick,
}: Props) {
  const [index, setIndex] = useState(ssrIndex);

  useEffect(() => {
    const cookie = cookieNameFor(pageKey);
    const existing = readCookie(cookie);
    if (existing !== null) {
      const parsed = Number.parseInt(existing, 10);
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed < variants.length) {
        if (parsed !== ssrIndex) setIndex(parsed);
        return;
      }
    }
    if (needsClientPick && variants.length > 1) {
      const pick = Math.floor(Math.random() * variants.length);
      writeCookie(cookie, String(pick), COOKIE_DAYS);
      if (pick !== ssrIndex) setIndex(pick);
    }
    // Run only on mount per pageKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  const v = variants[index] ?? variants[0];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={v.media_url}
      alt={v.alt ?? ""}
      className="absolute inset-0 h-full w-full object-cover"
      style={{ objectPosition: `${v.focal_x}% ${v.focal_y}%` }}
    />
  );
}
