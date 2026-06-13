import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";
import MarketingShell from "@/components/marketing-shell";
import PageHeroBanner from "@/components/page-hero-banner";

export const metadata = {
  title: "Sign in — SpecialCarers",
  description:
    "Sign in to SpecialCarers — for caregivers, families, and organisations.",
};

const AUDIENCES = [
  {
    href: "/login/caregiver",
    titleKey: "audienceCaregiverTitle",
    descKey: "audienceCaregiverDesc",
  },
  {
    href: "/login/family",
    titleKey: "audienceFamilyTitle",
    descKey: "audienceFamilyDesc",
  },
  {
    href: "/login/organisation",
    titleKey: "audienceOrgTitle",
    descKey: "audienceOrgDesc",
  },
] as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; sent?: string; error?: string }>;
}) {
  const t = await getTranslations("auth");
  const params = await searchParams;
  const redirectTo = params.redirect || "/dashboard";
  const sent = params.sent === "1";
  const error = params.error;

  // Preserve in-flight sign-ins: if the user is mid-flow (sent=1) or returning
  // from a callback with an error, keep the legacy single-form layout so we
  // never break a magic-link round trip.
  const showFormFallback = sent || Boolean(error);

  return (
    <MarketingShell>
      <PageHeroBanner pageKey="account.login" height="md" tint="soft" />

      <section className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-3xl">
          {showFormFallback ? (
            <div className="max-w-md mx-auto">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                {t("signInTitle")}
              </h1>
              <p className="mt-2 text-slate-600">{t("fallbackSubtitle")}</p>

              {sent && (
                <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
                  <strong>{t("checkInbox")}</strong> {t("sentLink")}
                </div>
              )}
              {error && (
                <div className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm">
                  {error === "callback"
                    ? t("errorCallback")
                    : t("errorGeneric")}
                </div>
              )}

              <div className="mt-8">
                <LoginForm redirectTo={redirectTo} />
              </div>

              <p className="mt-8 text-xs text-slate-500 text-center">
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
          ) : (
            <>
              <div className="text-center max-w-2xl mx-auto">
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
                  {t("signInTitle")}
                </h1>
                <p className="mt-3 text-slate-600">{t("chooserSubtitle")}</p>
              </div>

              <ul className="mt-10 grid gap-4 md:grid-cols-3">
                {AUDIENCES.map((a) => (
                  <li key={a.href}>
                    <Link
                      href={a.href}
                      className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-brand hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand"
                    >
                      <span className="text-lg font-semibold text-slate-900 group-hover:text-brand">
                        {t(a.titleKey)}
                      </span>
                      <span className="mt-2 text-sm text-slate-600">
                        {t(a.descKey)}
                      </span>
                      <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-brand">
                        {t("audienceContinue")}
                        <span
                          aria-hidden
                          className="transition-transform group-hover:translate-x-0.5"
                        >
                          &rarr;
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-10 flex flex-col items-center gap-2 text-sm text-slate-600">
                <span className="text-slate-500">{t("newToSpecialCarers")}</span>
                <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
                  <Link
                    href="/signup/caregiver"
                    className="font-medium text-brand hover:text-brand-600 underline"
                  >
                    {t("signupLinkCaregiver")}
                  </Link>
                  <Link
                    href="/signup/family"
                    className="font-medium text-brand hover:text-brand-600 underline"
                  >
                    {t("signupLinkFamily")}
                  </Link>
                  <Link
                    href="/signup/organisation"
                    className="font-medium text-brand hover:text-brand-600 underline"
                  >
                    {t("signupLinkOrg")}
                  </Link>
                </div>
              </div>

              <p className="mt-10 text-xs text-slate-500 text-center">
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
            </>
          )}
        </div>
      </section>
    </MarketingShell>
  );
}
