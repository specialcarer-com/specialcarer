import { getTranslations } from "next-intl/server";
import AudienceSignup from "../audience-signup";

export const metadata = {
  title: "Set up an organisation account — SpecialCarer",
  description:
    "Set up a SpecialCarer organisation account for your care company, council, or agency — multi-seat access and contract booking.",
};

export default async function OrganisationSignupPage() {
  const t = await getTranslations("auth");
  return (
    <AudienceSignup
      audience="organisation"
      pageKey="audience.organisations"
      headline={t("signupOrgHeadline")}
      intro={t("signupOrgIntro")}
      note={t("signupOrgNote")}
      signInHref="/login/organisation"
      next="/onboarding"
    />
  );
}
