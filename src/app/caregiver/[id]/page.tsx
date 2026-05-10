import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCaregiverProfile } from "@/lib/care/profile";

/**
 * Canonical carer profile lives at /m/carer/[id].
 *
 * This route is preserved for backwards-compat and SEO (sitemap, external
 * links, admin dashboards) and 308-redirects to the canonical URL so there's
 * a single rendering path and no chance of design drift between desktop and
 * mobile profiles.
 *
 * Metadata is still generated here so crawlers see correct title/description
 * before following the redirect.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const profile = await getCaregiverProfile(id);
  if (!profile || !profile.is_published) {
    return { title: "Caregiver — SpecialCarer" };
  }
  const country = profile.country === "GB" ? "UK" : "US";
  return {
    title: `${profile.display_name ?? "Caregiver"} — ${profile.city ?? country} caregiver | SpecialCarer`,
    description:
      profile.headline ||
      profile.bio?.slice(0, 160) ||
      "Verified, background-checked caregiver on SpecialCarer.",
    alternates: { canonical: `/m/carer/${id}` },
  };
}

export default async function CaregiverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/m/carer/${id}`);
}
