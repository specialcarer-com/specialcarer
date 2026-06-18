import type { CaregiverProfileFull } from "@/lib/care/profile";

/**
 * Absolute site origin for building shareable links, e.g. og:url and the
 * copy-link target. Mirrors the fallback used elsewhere (dashboard, referrals).
 */
export function siteOrigin(): string {
  // Treat blank/whitespace env vars as unset so we never emit a relative link.
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (configured || "https://specialcarer.com").replace(/\/$/, "");
}

/** Canonical public path for a carer — friendly /c/<slug> when available. */
export function publicProfilePath(
  profile: Pick<CaregiverProfileFull, "user_id" | "public_slug">,
): string {
  return profile.public_slug
    ? `/c/${profile.public_slug}`
    : `/caregiver/${profile.user_id}`;
}

/** Absolute public URL for a carer profile. */
export function publicProfileUrl(
  profile: Pick<CaregiverProfileFull, "user_id" | "public_slug">,
): string {
  return `${siteOrigin()}${publicProfilePath(profile)}`;
}
