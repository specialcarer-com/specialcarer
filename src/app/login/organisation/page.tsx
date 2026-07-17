import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("auth");
  const params = await searchParams;
  const redirectTo = params.redirect || "/dashboard?audience=organisation";
  return (
    <AudienceSignIn
      audience="organisation"
      pageKey="audience.organisations"
      headline={t("orgHeadline")}
      intro={t("orgIntro")}
      signupCta={{
        lead: t("orgCtaLead"),
        label: t("orgCtaLabel"),
        href: "/organisations#apply",
      }}
      redirectTo={redirectTo}
      sent={params.sent === "1"}
      error={params.error}
    />
  );
}
