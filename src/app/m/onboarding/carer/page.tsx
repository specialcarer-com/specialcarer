import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeReadiness, type ProfileReadiness } from "@/lib/care/profile";
import { TopBar } from "../../_components/ui";
import { CarerOnboardingWizardClient } from "./WizardClient";

export const dynamic = "force-dynamic";

/**
 * Guided carer onboarding wizard.
 *
 * Steps: 1) About you  2) Services + experience  3) Rates + location
 *        4) Vetting overview  5) Publish (membership gate).
 *
 * Drives the existing PATCH /api/caregiver/profile + POST publish endpoints.
 * The wizard is mobile-only (`/m/onboarding/carer`). After publish it routes
 * to /m/profile so the user lands on their live profile.
 */
export default async function CarerOnboardingWizardPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect("/m/login?next=/m/onboarding/carer");
  }

  // Confirm this user is actually a carer; non-carers don't belong here.
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    // Fail closed: surface a recoverable error rather than silently routing.
    throw new Error("profile_lookup_failed");
  }
  if (!profile || profile.role !== "caregiver") {
    redirect("/dashboard");
  }

  // Pull the current caregiver_profiles row so we can prefill the wizard.
  const { data: cp, error: cpError } = await admin
    .from("caregiver_profiles")
    .select(
      "display_name, headline, bio, city, postcode, country, services, care_formats, hourly_rate_cents, weekly_rate_cents, years_experience, languages, is_published, public_slug",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (cpError) {
    throw new Error("caregiver_profile_lookup_failed");
  }

  const readiness: ProfileReadiness = await computeReadiness(user.id);

  // Already-published carers can edit instead of being walked through the wizard.
  if (readiness.isPublished) {
    redirect("/m/profile");
  }

  return (
    <main className="min-h-[100dvh] bg-bg-screen flex flex-col">
      <TopBar title="Get set up" back="/m/profile" />
      <CarerOnboardingWizardClient
        initial={{
          display_name: cp?.display_name ?? profile.full_name ?? "",
          headline: cp?.headline ?? "",
          bio: cp?.bio ?? "",
          city: cp?.city ?? "",
          postcode: cp?.postcode ?? "",
          country: (cp?.country as "GB" | "US" | undefined) ?? "GB",
          services: (cp?.services as string[] | null) ?? [],
          care_formats: (cp?.care_formats as string[] | null) ?? [],
          hourly_rate_cents: cp?.hourly_rate_cents ?? null,
          weekly_rate_cents: cp?.weekly_rate_cents ?? null,
          years_experience: cp?.years_experience ?? 0,
          languages: (cp?.languages as string[] | null) ?? ["English"],
          is_published: cp?.is_published ?? false,
          public_slug: cp?.public_slug ?? null,
        }}
        readiness={readiness}
      />
    </main>
  );
}
