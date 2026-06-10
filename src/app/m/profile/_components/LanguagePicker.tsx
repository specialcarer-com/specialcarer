"use client";

/**
 * UI language picker (gap 43 V1A).
 *
 * Persists the choice to profiles.chat_translate_to via the existing
 * /api/m/me/chat-translate-pref endpoint (the UI locale and the in-chat
 * translation target are unified on one column), then sets the NEXT_LOCALE
 * cookie and refreshes so the new locale takes effect without a manual reload.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  LOCALE_COOKIE,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  isAppLocale,
  type AppLocale,
} from "@/i18n/config";

export function LanguagePicker() {
  const t = useTranslations("common");
  const router = useRouter();
  const active = useLocale();
  const current: AppLocale = isAppLocale(active) ? active : "en-GB";
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function onChange(next: AppLocale) {
    if (next === current || busy) return;
    setBusy(true);
    try {
      // Reuse PR #70's endpoint — chat_translate_to doubles as the UI locale.
      await fetch("/api/m/me/chat-translate-pref", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: next }),
      });
    } catch {
      // Cookie + refresh below still applies the choice for this session even
      // if the profile write fails (e.g. signed-out preview).
    }
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <label className="flex items-center gap-3 px-4 py-3.5">
      <span className="flex-1 text-[14.5px] font-medium text-heading">
        {t("language")}
      </span>
      <select
        aria-label={t("languagePickerLabel")}
        value={current}
        disabled={busy || pending}
        onChange={(e) => onChange(e.target.value as AppLocale)}
        className="rounded-pill bg-muted px-3 py-1.5 text-[13px] font-semibold text-heading disabled:opacity-50"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
