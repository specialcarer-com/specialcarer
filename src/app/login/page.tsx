import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";
import MarketingShell from "@/components/marketing-shell";
import PageHeroBanner from "@/components/page-hero-banner";

export const metadata = {
  title: "Sign in — SpecialCarer",
  description:
    "Sign in to SpecialCarer — for caregivers, families, and organisations.",
};

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

  return (
    <MarketingShell>
      <PageHeroBanner pageKey="account.login" height="md" tint="soft" />

      <section className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-3xl">
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
                {error === "callback" ? t("errorCallback") : t("errorGeneric")}
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
        </div>
      </section>
    </MarketingShell>
  );
}
