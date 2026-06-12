import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignupForm, type SignupAudience } from "./signup-form";
import MarketingShell from "@/components/marketing-shell";
import PageHeroBanner from "@/components/page-hero-banner";

export type AudienceSignupProps = {
  audience: SignupAudience;
  pageKey: string;
  headline: string;
  intro: string;
  /** One-line legal / safeguarding / process note shown under the form. */
  note: string;
  /** Matching sign-in route for people who already have an account. */
  signInHref: string;
  next: string;
};

/**
 * Shared layout for the per-audience sign-up pages. Each audience hardcodes
 * its own variant — there is no role picker and no ?audience= query param.
 * Auth is email OTP, identical to /login.
 */
export default async function AudienceSignup({
  audience,
  pageKey,
  headline,
  intro,
  note,
  signInHref,
  next,
}: AudienceSignupProps) {
  const t = await getTranslations("auth");
  return (
    <MarketingShell>
      <PageHeroBanner pageKey={pageKey} height="md" tint="soft" />

      <section className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            {headline}
          </h1>
          <p className="mt-2 text-slate-600">{intro}</p>

          <div className="mt-8">
            <SignupForm audience={audience} next={next} />
          </div>

          <p className="mt-4 text-xs text-slate-500">{note}</p>

          <p className="mt-8 text-sm text-slate-600 text-center">
            {t("alreadyHaveAccount")}{" "}
            <Link
              href={signInHref}
              className="font-medium text-brand hover:text-brand-600 underline"
            >
              {t("signInInstead")}
            </Link>
          </p>

          <p className="mt-6 text-xs text-slate-500 text-center">
            {t("termsPrefix")}{" "}
            <Link href="/terms" className="underline hover:text-slate-700">
              {t("terms")}
            </Link>{" "}
            {t("and")}{" "}
            <Link href="/privacy" className="underline hover:text-slate-700">
              {t("privacyPolicy")}
            </Link>
            .
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
