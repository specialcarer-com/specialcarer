import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicCaregiverProfile } from "@/lib/care/profile";
import { buildCaregiverMetadata } from "@/lib/care/public-metadata";
import PublicCarerProfile from "@/components/profile/PublicCarerProfile";

/**
 * Public, unauthenticated carer profile — the canonical SEO + share target.
 *
 * UK-only: getPublicCaregiverProfile filters country = "GB", so non-GB or
 * unpublished profiles 404. Rendered server-side with full OpenGraph/Twitter
 * metadata so shared links preview nicely. The richer in-app view lives at
 * /m/carer/[id] (auth-required); this page is the world-readable surface.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const profile = await getPublicCaregiverProfile(id);
  return buildCaregiverMetadata(profile);
}

export default async function CaregiverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getPublicCaregiverProfile(id);
  if (!profile) notFound();
  return <PublicCarerProfile profile={profile} />;
}
