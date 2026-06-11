"use client";

/**
 * AccessibilityProvider — client context for the two non-locale accessibility
 * preferences on the /m surface:
 *   • textScale    ("md" | "lg" large-text mode)
 *   • voiceEnabled (voice booking FAB on/off)
 *
 * Locale is NO LONGER owned here. It moved to next-intl (cookie-backed,
 * unified with profiles.chat_translate_to) in the gap-43 V1C migration — read
 * it with `useLocale()` / `useTranslations()` from next-intl instead.
 *
 * These two prefs stay in localStorage because they are device-level display
 * settings with no server-side counterpart.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { LOCALE_COOKIE, isAppLocale } from "@/i18n/config";

// ─── storage keys ──────────────────────────────────────────────────────────
const KEY_TEXT_SCALE = "sc:textScale";
const KEY_VOICE = "sc:voiceEnabled";
// Legacy locale key, written by the removed LocaleContext. Read once to migrate
// the saved locale into the next-intl cookie, then deleted.
const LEGACY_KEY_LOCALE = "sc:locale";

// Legacy locale codes → next-intl AppLocale. Codes with no V1 equivalent
// (zh/ar/hi) are intentionally omitted: those users fall through to the
// cookie/Accept-Language resolution rather than a dead locale.
const LEGACY_LOCALE_MAP: Record<string, string> = {
  en: "en-GB",
  es: "es",
  fr: "fr",
};

// ─── types ─────────────────────────────────────────────────────────────────
export type TextScale = "md" | "lg";

interface AccessibilityContextValue {
  textScale: TextScale;
  setTextScale: (s: TextScale) => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue>({
  textScale: "md",
  setTextScale: () => undefined,
  voiceEnabled: false,
  setVoiceEnabled: () => undefined,
});

/**
 * One-time migration of the legacy localStorage locale into the next-intl
 * cookie. Runs on first client load after V1C ships; self-deletes the legacy
 * key so it never runs twice. Only writes the cookie if one is not already set
 * (the cookie / profile is now the source of truth and must win).
 */
function migrateLegacyLocale() {
  if (typeof window === "undefined") return;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LEGACY_KEY_LOCALE);
  } catch {
    return;
  }
  if (stored === null) return;

  const mapped = LEGACY_LOCALE_MAP[stored];
  const hasCookie = document.cookie
    .split("; ")
    .some((c) => c.startsWith(`${LOCALE_COOKIE}=`));
  if (mapped && isAppLocale(mapped) && !hasCookie) {
    document.cookie = `${LOCALE_COOKIE}=${mapped}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }
  try {
    localStorage.removeItem(LEGACY_KEY_LOCALE);
  } catch {
    // best-effort cleanup
  }
}

// ─── provider ──────────────────────────────────────────────────────────────
export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [textScale, setTextScaleState] = useState<TextScale>("md");
  const [voiceEnabled, setVoiceEnabledState] = useState(false);

  // Hydrate from localStorage on the client + run the one-time locale migration.
  useEffect(() => {
    if (typeof window === "undefined") return;

    migrateLegacyLocale();

    const storedScale = localStorage.getItem(KEY_TEXT_SCALE) as TextScale | null;
    if (storedScale === "lg" || storedScale === "md") {
      setTextScaleState(storedScale);
    }

    const storedVoice = localStorage.getItem(KEY_VOICE);
    if (storedVoice === "true") setVoiceEnabledState(true);
  }, []);

  // Apply data-sc-text-scale attribute whenever textScale changes.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.scTextScale = textScale;
  }, [textScale]);

  const setTextScale = useCallback((s: TextScale) => {
    setTextScaleState(s);
    if (typeof window !== "undefined") localStorage.setItem(KEY_TEXT_SCALE, s);
  }, []);

  const setVoiceEnabled = useCallback((v: boolean) => {
    setVoiceEnabledState(v);
    if (typeof window !== "undefined") localStorage.setItem(KEY_VOICE, String(v));
  }, []);

  const value = useMemo(
    () => ({ textScale, setTextScale, voiceEnabled, setVoiceEnabled }),
    [textScale, setTextScale, voiceEnabled, setVoiceEnabled],
  );

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

// ─── hook ──────────────────────────────────────────────────────────────────
export function useAccessibility() {
  return useContext(AccessibilityContext);
}
