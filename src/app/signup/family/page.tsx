import { getTranslations } from "next-intl/server";
import AudienceSignup from "../audience-signup";

export const metadata = {
  title: "Create your family account — SpecialCarer",
  description:
    "Create a SpecialCarer family account to find trusted, vetted carers near you.",
};

export default async function FamilySignupPage() {
  const t = await getTranslations("auth");
  return (
    <AudienceSignup
      audience="family"
      pageKey="audience.families"
      headline={t("signupFamilyHeadline")}
      intro={t("signupFamilyIntro")}
      note={t("signupFamilyNote")}
      signInHref="/login/family"
      next="/onboarding"
    />
  );
}
