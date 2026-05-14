import AudienceSignIn from "../audience-sign-in";

export const metadata = {
  title: "Family sign in — SpecialCarer",
  description:
    "Sign in to your SpecialCarer family account to book trusted carers, manage your care plan, and view invoices.",
};

export default async function FamilyLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirect || "/dashboard?audience=family";
  return (
    <AudienceSignIn
      audience="family"
      pageKey="account.login"
      headline="Sign in to your family account"
      intro="Use your email or your Google account. New here? We'll set you up automatically when you sign in — no separate signup needed."
      signupCta={null}
      redirectTo={redirectTo}
      sent={params.sent === "1"}
      error={params.error}
    />
  );
}
