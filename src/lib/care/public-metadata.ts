import type { Metadata } from "next";
import type { CaregiverProfileFull } from "@/lib/care/profile";
import { publicProfileUrl } from "@/lib/care/public-url";

/**
 * Build OpenGraph + Twitter Card metadata for the public carer profile.
 *
 * Pure (no I/O) so it can be unit-tested. Pass `null` for a missing /
 * non-GB / unpublished carer to get the generic fallback title.
 */
export function buildCaregiverMetadata(
  profile: CaregiverProfileFull | null,
): Metadata {
  if (!profile) {
    return { title: "Caregiver — SpecialCarer" };
  }

  const name = profile.display_name ?? "Caregiver";
  const role = primaryRole(profile.services);
  const title = `${name} — ${role} on SpecialCarer`;
  const description = bioExcerpt(profile.bio, profile.headline);
  const url = publicProfileUrl(profile);
  const image = profile.photo_url ?? "/brand/og-image.png";

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "profile",
      siteName: "SpecialCarer",
      images: [{ url: image, alt: name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export function bioExcerpt(
  bio: string | null,
  headline: string | null,
): string {
  const source = headline?.trim() || bio?.trim() || "";
  if (!source) {
    return "Verified, DBS-checked caregiver on SpecialCarer.";
  }
  return source.length > 160 ? `${source.slice(0, 157)}…` : source;
}

export function primaryRole(services: string[]): string {
  if (services.length === 0) return "Caregiver";
  return services[0]
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
