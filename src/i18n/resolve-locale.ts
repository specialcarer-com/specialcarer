import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isAppLocale,
  type AppLocale,
} from "./config";

/**
 * Resolve the active UI locale from the available signals, in priority order:
 *
 *   1. profile (profiles.chat_translate_to) — authed users' explicit choice
 *   2. NEXT_LOCALE cookie — anonymous choice from the language picker
 *   3. Accept-Language header — browser preference
 *   4. DEFAULT_LOCALE ('en-GB')
 *
 * A signal only counts when it names a locale we actually ship; anything
 * unsupported is skipped so we fall through to the next signal rather than
 * rendering a missing-message locale.
 */
export function resolveLocale(opts: {
  profileLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}): AppLocale {
  const { profileLocale, cookieLocale, acceptLanguage } = opts;

  if (isAppLocale(profileLocale)) return profileLocale;
  if (isAppLocale(cookieLocale)) return cookieLocale;

  const fromHeader = matchAcceptLanguage(acceptLanguage);
  if (fromHeader) return fromHeader;

  return DEFAULT_LOCALE;
}

/**
 * Pick the best supported locale from an Accept-Language header, honouring
 * q-weights. Matches exact tags first ("es" → "es"), then language prefixes
 * ("es-MX" → "es", "en-US" → "en-GB").
 */
export function matchAcceptLanguage(
  header: string | null | undefined,
): AppLocale | null {
  if (!header) return null;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    // Exact match (case-insensitive) against a supported locale.
    const exact = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    // Prefix match: header "es-mx" → supported "es"; "en-au" → "en-GB".
    const prefix = tag.split("-")[0];
    const byPrefix = SUPPORTED_LOCALES.find(
      (l) => l.toLowerCase().split("-")[0] === prefix,
    );
    if (byPrefix) return byPrefix;
  }

  return null;
}
