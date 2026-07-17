import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("auth");
  const params = await searchParams;
  const redirectTo = params.redirect || "/dashboard?audience=caregiver";
  return (
    <AudienceSignIn
      audience="caregiver"
      pageKey="audience.caregivers"
      headline={t("caregiverHeadline")}
      intro={t("caregiverIntro")}
      signupCta={{
        lead: t("caregiverCtaLead"),
        label: t("caregiverCtaLabel"),
        href: "/become-a-caregiver",
      }}
      redirectTo={redirectTo}
      sent={params.sent === "1"}
      error={params.error}
    />
  );
}
