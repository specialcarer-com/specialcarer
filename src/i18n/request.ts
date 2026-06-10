import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type AppLocale } from "./config";
import { resolveLocale } from "./resolve-locale";
import { deepMerge, loadMessages } from "./messages";

/**
 * next-intl request config (App Router, no URL prefixes).
 *
 * Locale priority: profiles.chat_translate_to → NEXT_LOCALE cookie →
 * Accept-Language → 'en-GB'. en-GB is always merged in underneath the active
 * locale so a missing key in es/ur falls back to English rather than rendering
 * the raw key.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  let profileLocale: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("chat_translate_to")
        .eq("id", user.id)
        .maybeSingle<{ chat_translate_to: string | null }>();
      profileLocale = profile?.chat_translate_to ?? null;
    }
  } catch {
    // Anonymous request or Supabase unavailable — fall through to cookie/header.
  }

  const locale: AppLocale = resolveLocale({
    profileLocale,
    cookieLocale: cookieStore.get(LOCALE_COOKIE)?.value ?? null,
    acceptLanguage: headerStore.get("accept-language"),
  });

  const base = await loadMessages(DEFAULT_LOCALE);
  const messages =
    locale === DEFAULT_LOCALE
      ? base
      : deepMerge(base, await loadMessages(locale));

  return { locale, messages };
});
