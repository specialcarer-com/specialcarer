import AudienceSignIn from "../audience-sign-in";

export const metadata = {
  title: "Caregiver sign in — SpecialCarer",
  description:
    "Sign in to your SpecialCarer caregiver account to pick up shifts, manage bookings, and get paid.",
};

export default async function CaregiverLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirect || "/dashboard?audience=caregiver";
  return (
    <AudienceSignIn
      audience="caregiver"
      pageKey="audience.caregivers"
      headline="Sign in to your caregiver account"
      intro="Pick up shifts, manage bookings, see your payouts, and grow your reputation."
      signupCta={{
        lead: "New to SpecialCarer?",
        label: "Apply to be a caregiver",
        href: "/become-a-caregiver",
      }}
      redirectTo={redirectTo}
      sent={params.sent === "1"}
      error={params.error}
    />
  );
}
