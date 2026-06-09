/**
 * The nine languages offered for in-chat translation (gap 4), kept in
 * sync with the gap-43 language set. `code` is what we persist in
 * profiles.chat_translate_to and send as target_lang to the translate
 * endpoint; it must match the ^[a-z]{2}(-[A-Z]{2})?$ shape enforced by
 * the DB check and the handler.
 */
export type ChatLanguage = {
  code: string;
  label: string;
  flag: string;
};

export const CHAT_LANGUAGES: readonly ChatLanguage[] = [
  { code: "en-GB", label: "English (UK)", flag: "🇬🇧" },
  { code: "en-US", label: "English (US)", flag: "🇺🇸" },
  { code: "es", label: "Spanish", flag: "🇪🇸" },
  { code: "pl", label: "Polish", flag: "🇵🇱" },
  { code: "ur", label: "Urdu", flag: "🇵🇰" },
  { code: "ro", label: "Romanian", flag: "🇷🇴" },
  { code: "bn", label: "Bengali", flag: "🇧🇩" },
  { code: "de", label: "German", flag: "🇩🇪" },
  { code: "fr", label: "French", flag: "🇫🇷" },
] as const;

const BY_CODE = new Map(CHAT_LANGUAGES.map((l) => [l.code, l]));

export function languageByCode(code: string | null): ChatLanguage | null {
  if (!code) return null;
  return BY_CODE.get(code) ?? null;
}

export function isSupportedLanguage(code: string): boolean {
  return BY_CODE.has(code);
}
