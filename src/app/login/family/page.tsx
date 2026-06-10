import { getTranslations } from "next-intl/server";
import AudienceSignIn from "../audience-sign-in";

export const metadata = {
  title: "Family sign in — SpecialCarers",
  description:
    "Sign in to your SpecialCarers family account to book trusted carers, manage your care plan, and view invoices.",
};

export default async function FamilyLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; sent?: string; error?: string }>;
}) {
  const t = await getTranslations("auth");
  const params = await searchParams;
  const redirectTo = params.redirect || "/dashboard?audience=family";
  return (
    <AudienceSignIn
      audience="family"
      pageKey="account.login"
      headline={t("familyHeadline")}
      intro={t("familyIntro")}
      signupCta={null}
      redirectTo={redirectTo}
      sent={params.sent === "1"}
      error={params.error}
    />
  );
}
