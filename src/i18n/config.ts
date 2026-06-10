/**
 * i18n config for the UI locale (gap 43 V1A).
 *
 * The UI locale is unified with the in-chat translation target — both live in
 * profiles.chat_translate_to — so the supported set is a subset of
 * CHAT_LANGUAGES. V1A ships three starter locales; PR B adds the rest.
 *
 * Codes follow BCP-47 in the ^[a-z]{2}(-[A-Z]{2})?$ shape the DB check and the
 * chat-translate-pref handler already enforce.
 */

export const SUPPORTED_LOCALES = ["en-GB", "es", "ur"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en-GB";

/** Native labels shown in the language picker. */
export const LOCALE_LABELS: Record<AppLocale, string> = {
  "en-GB": "English (UK)",
  es: "Español",
  ur: "اردو",
};

/** Locales that render right-to-left. */
export const RTL_LOCALES: ReadonlySet<AppLocale> = new Set<AppLocale>(["ur"]);

/** Cookie next-intl reads/writes for the visitor's chosen locale. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: AppLocale): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}
