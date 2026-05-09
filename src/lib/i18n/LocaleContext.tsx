"use client";

/**
 * AccessibilityContext — single context for:
 *   • locale   (i18n language selection)
 *   • textScale ("md" | "lg" large-text mode)
 *   • voiceEnabled (voice booking FAB on/off)
 *
 * Server-side rendering defaults to "en" / "md" / false.
 * Client reads from localStorage and navigator.language on hydration.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LOCALE,
  getMessagesSync,
  LOCALE_DIR,
  matchLocale,
  type Locale,
} from "./index";
import type { Messages } from "./types";

// ─── storage keys ──────────────────────────────────────────────────────────
const KEY_LOCALE = "sc:locale";
const KEY_TEXT_SCALE = "sc:textScale";
const KEY_VOICE = "sc:voiceEnabled";

// ─── types ─────────────────────────────────────────────────────────────────
export type TextScale = "md" | "lg";

interface AccessibilityContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  textScale: TextScale;
  setTextScale: (s: TextScale) => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
  messages: Messages;
  /** Dot-path translation helper: t("common.ok") */
  t: (key: string) => string;
  dir: "ltr" | "rtl";
}

const AccessibilityContext = createContext<AccessibilityContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  textScale: "md",
  setTextScale: () => undefined,
  voiceEnabled: false,
  setVoiceEnabled: () => undefined,
  messages: getMessagesSync(DEFAULT_LOCALE),
  t: (key) => key,
  dir: "ltr",
});

// ─── dot-path resolver ─────────────────────────────────────────────────────
function resolvePath(obj: unknown, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

// ─── provider ──────────────────────────────────────────────────────────────
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [textScale, setTextScaleState] = useState<TextScale>("md");
  const [voiceEnabled, setVoiceEnabledState] = useState(false);

  // Hydrate from localStorage / navigator on the client
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Locale
    const storedLocale = localStorage.getItem(KEY_LOCALE) as Locale | null;
    if (storedLocale && ["en", "es", "fr", "zh", "ar", "hi"].includes(storedLocale)) {
      setLocaleState(storedLocale);
    } else {
      const navLang = navigator?.language ?? "";
      setLocaleState(matchLocale(navLang));
    }

    // Text scale
    const storedScale = localStorage.getItem(KEY_TEXT_SCALE) as TextScale | null;
    if (storedScale === "lg" || storedScale === "md") {
      setTextScaleState(storedScale);
    }

    // Voice
    const storedVoice = localStorage.getItem(KEY_VOICE);
    if (storedVoice === "true") setVoiceEnabledState(true);
  }, []);

  // Apply data-sc-text-scale attribute whenever textScale changes
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.scTextScale = textScale;
  }, [textScale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") localStorage.setItem(KEY_LOCALE, l);
  }, []);

  const setTextScale = useCallback((s: TextScale) => {
    setTextScaleState(s);
    if (typeof window !== "undefined") localStorage.setItem(KEY_TEXT_SCALE, s);
  }, []);

  const setVoiceEnabled = useCallback((v: boolean) => {
    setVoiceEnabledState(v);
    if (typeof window !== "undefined") localStorage.setItem(KEY_VOICE, String(v));
  }, []);

  const messages = useMemo(() => getMessagesSync(locale), [locale]);

  const t = useCallback(
    (key: string) => resolvePath(messages, key),
    [messages],
  );

  const dir = LOCALE_DIR[locale] ?? "ltr";

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      textScale,
      setTextScale,
      voiceEnabled,
      setVoiceEnabled,
      messages,
      t,
      dir,
    }),
    [locale, setLocale, textScale, setTextScale, voiceEnabled, setVoiceEnabled, messages, t, dir],
  );

  return (
    <AccessibilityContext.Provider value={value}>
      <div lang={locale} dir={dir}>
        {children}
      </div>
    </AccessibilityContext.Provider>
  );
}

// ─── hooks ─────────────────────────────────────────────────────────────────
export function useAccessibility() {
  return useContext(AccessibilityContext);
}

/** Convenience alias — returns the t() helper only. */
export function useT() {
  return useContext(AccessibilityContext).t;
}
