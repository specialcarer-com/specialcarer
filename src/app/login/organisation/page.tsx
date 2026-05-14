import AudienceSignIn from "../audience-sign-in";

export const metadata = {
  title: "Organisation sign in — SpecialCarer",
  description:
    "Sign in to your SpecialCarer organisation account — care homes, councils, NHS trusts, fostering agencies, and charities.",
};

export default async function OrganisationLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirect || "/dashboard?audience=organisation";
  return (
    <AudienceSignIn
      audience="organisation"
      pageKey="audience.organisations"
      headline="Sign in to your organisation account"
      intro="Care homes, councils, NHS trusts, fostering agencies, schools, and charities — manage bookings, contracts, and your team."
      signupCta={{
        lead: "Not partnered with SpecialCarer yet?",
        label: "Talk to our partnerships team",
        href: "/organisations#apply",
      }}
      redirectTo={redirectTo}
      sent={params.sent === "1"}
      error={params.error}
    />
  );
}
