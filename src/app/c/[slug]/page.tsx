import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import {
  getPublicCaregiverProfileBySlug,
} from "@/lib/care/profile";
import { isValidSlug } from "@/lib/care/slug";

/**
 * Friendly public alias: /c/<slug> → canonical /caregiver/<user_id>.
 *
 * Keeps a single rendering path (the canonical route) while exposing the
 * shorter, shareable URL. GB-only + published enforced by the slug lookup.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // The canonical page emits the rich metadata; this alias just points there.
  if (!isValidSlug(slug)) return { title: "Caregiver — SpecialCarers" };
  const profile = await getPublicCaregiverProfileBySlug(slug);
  return {
    title: profile
      ? `${profile.display_name ?? "Caregiver"} — SpecialCarers`
      : "Caregiver — SpecialCarers",
    alternates: { canonical: `/caregiver/${profile?.user_id ?? ""}` },
  };
}

export default async function CarerSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const profile = await getPublicCaregiverProfileBySlug(slug);
  if (!profile) notFound();
  permanentRedirect(`/caregiver/${profile.user_id}`);
}
