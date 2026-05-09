import type { Locale, Messages } from "./types";

export type { Locale, Messages };

export const LOCALES: Locale[] = ["en", "es", "fr", "zh", "ar", "hi"];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  zh: "中文",
  ar: "العربية",
  hi: "हिन्दी",
};

/** Text direction per locale. Defaults to "ltr". */
export const LOCALE_DIR: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  es: "ltr",
  fr: "ltr",
  zh: "ltr",
  ar: "rtl",
  hi: "ltr",
};

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Dynamically import messages for the given locale.
 * Falls back to EN if something goes wrong.
 */
export async function getMessages(locale: Locale): Promise<Messages> {
  try {
    switch (locale) {
      case "en": {
        const m = await import("./messages/en");
        return m.default;
      }
      case "es": {
        const m = await import("./messages/es");
        return m.default;
      }
      case "fr": {
        const m = await import("./messages/fr");
        return m.default;
      }
      case "zh": {
        const m = await import("./messages/zh");
        return m.default;
      }
      case "ar": {
        const m = await import("./messages/ar");
        return m.default;
      }
      case "hi": {
        const m = await import("./messages/hi");
        return m.default;
      }
    }
  } catch {
    const m = await import("./messages/en");
    return m.default;
  }
}

/**
 * Synchronously get messages — used client-side where the locale file
 * can be imported eagerly per-bundle.  We load all locales into the
 * client bundle here; total gzip size is negligible (~3 kB).
 */
import enMessages from "./messages/en";
import esMessages from "./messages/es";
import frMessages from "./messages/fr";
import zhMessages from "./messages/zh";
import arMessages from "./messages/ar";
import hiMessages from "./messages/hi";

const MESSAGE_MAP: Record<Locale, Messages> = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  zh: zhMessages,
  ar: arMessages,
  hi: hiMessages,
};

export function getMessagesSync(locale: Locale): Messages {
  return MESSAGE_MAP[locale] ?? enMessages;
}

/**
 * Resolve a locale string from navigator.language to the nearest
 * supported Locale, falling back to DEFAULT_LOCALE.
 */
export function matchLocale(lang: string): Locale {
  const lower = lang.toLowerCase();
  // Exact match
  for (const l of LOCALES) {
    if (lower === l) return l;
  }
  // Prefix match (e.g. "zh-CN" → "zh")
  for (const l of LOCALES) {
    if (lower.startsWith(l + "-") || lower.startsWith(l + "_")) return l;
  }
  // Two-char language prefix
  const prefix = lower.slice(0, 2);
  for (const l of LOCALES) {
    if (l === prefix) return l;
  }
  return DEFAULT_LOCALE;
}
