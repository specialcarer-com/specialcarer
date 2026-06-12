"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppLogo } from "../../_components/ui";
import { Enrolment } from "../../profile/security/Enrolment";

/**
 * 2FA-required gate — /m/sign-in/2fa-required (gap 13).
 *
 * Shown when a user with profiles.mfa_required = true and a lapsed grace period
 * signs in without an active TOTP factor. There is NO skip: the only way
 * forward is to enrol. On completion we send them to /m/home (middleware then
 * routes carers onward).
 */
export default function TwoFactorRequiredPage() {
  const t = useTranslations("security");
  const router = useRouter();

  return (
    <main className="min-h-[100dvh] bg-white">
      <div className="sc-safe-top px-6 pt-8 flex flex-col items-center">
        <AppLogo size={92} />
      </div>
      <div className="px-6 mt-8 space-y-4">
        <h1 className="text-center text-[26px] font-bold text-heading">
          {t("requiredTitle")}
        </h1>
        <p className="text-center text-subheading text-[14px]">
          {t("requiredIntro")}
        </p>
        <Enrolment onDone={() => router.replace("/m/home")} />
      </div>
    </main>
  );
}
