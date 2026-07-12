import { getTranslations } from "next-intl/server";
import AudienceSignup from "../audience-signup";

export const metadata = {
  title: "Apply to caregive — SpecialCarers",
  description:
    "Apply to caregive on SpecialCarers. Apply in 5 minutes, clear your background checks in 1–5 days, then start booking shifts.",
};

export default async function CaregiverSignupPage() {
  const t = await getTranslations("auth");
  return (
    <AudienceSignup
      audience="caregiver"
      pageKey="audience.caregivers"
      headline={t("signupCaregiverHeadline")}
      intro={t("signupCaregiverIntro")}
      note={t("signupCaregiverNote")}
      signInHref="/login/caregiver"
      next="/onboarding"
    />
  );
}
