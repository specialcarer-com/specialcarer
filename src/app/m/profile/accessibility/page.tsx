"use client";

import { useEffect, useState } from "react";
import { TopBar, Toggle } from "../../_components/ui";
import {
  useAccessibility,
  type TextScale,
} from "@/lib/i18n/LocaleContext";
import {
  LOCALES,
  LOCALE_LABELS,
  type Locale,
} from "@/lib/i18n";

/**
 * Accessibility settings page — /m/profile/accessibility
 *
 * • Language picker (radio list with native names)
 * • Large-text toggle
 * • Reduced-motion indicator (read-only, reflects prefers-reduced-motion)
 * • Voice booking toggle
 */
export default function AccessibilityPage() {
  const {
    locale,
    setLocale,
    textScale,
    setTextScale,
    voiceEnabled,
    setVoiceEnabled,
    t,
  } = useAccessibility();

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Detect prefers-reduced-motion on client only
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="min-h-screen bg-bg-screen">
      <TopBar title={t("accessibility.settings")} back="/m/profile" />

      <div className="px-5 pt-4 pb-16 space-y-6">

        {/* ── Language ────────────────────────────────────────────────── */}
        <section aria-labelledby="sc-a11y-lang-heading">
          <p
            id="sc-a11y-lang-heading"
            className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-subheading"
          >
            {t("accessibility.language")}
          </p>

          <ul className="overflow-hidden rounded-card bg-white shadow-card">
            {LOCALES.map((l: Locale, i) => {
              const isSelected = locale === l;
              return (
                <li
                  key={l}
                  className={i > 0 ? "border-t border-line" : ""}
                >
                  <label className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-muted/60">
                    {/* Visually hidden native radio — we style the whole row */}
                    <input
                      type="radio"
                      name="sc-locale"
                      value={l}
                      checked={isSelected}
                      onChange={() => setLocale(l)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className={[
                        "flex-shrink-0 h-5 w-5 rounded-full border-2 grid place-items-center",
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-line bg-white",
                      ].join(" ")}
                    >
                      {isSelected && (
                        <span className="h-2 w-2 rounded-full bg-white" />
                      )}
                    </span>
                    <span className="flex-1 text-[14.5px] font-medium text-heading">
                      {LOCALE_LABELS[l]}
                    </span>
                    {isSelected && (
                      <span className="text-[11px] font-semibold text-primary uppercase tracking-wide">
                        Active
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Display ─────────────────────────────────────────────────── */}
        <section aria-labelledby="sc-a11y-display-heading">
          <p
            id="sc-a11y-display-heading"
            className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-subheading"
          >
            Display
          </p>

          <ul className="overflow-hidden rounded-card bg-white shadow-card">
            {/* Large text */}
            <li>
              <div className="flex items-start gap-3 px-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] font-medium text-heading">
                    {t("accessibility.largeText")}
                  </p>
                  <p className="mt-0.5 text-[12px] text-subheading leading-snug">
                    {t("accessibility.largeTextHelp")}
                  </p>
                </div>
                <Toggle
                  checked={textScale === "lg"}
                  onChange={(v) => setTextScale(v ? "lg" : "md" as TextScale)}
                  label={t("accessibility.largeText")}
                />
              </div>
            </li>

            {/* Reduced motion — read-only badge */}
            <li className="border-t border-line">
              <div className="flex items-start gap-3 px-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] font-medium text-heading">
                    {t("accessibility.reducedMotion")}
                  </p>
                  <p className="mt-0.5 text-[12px] text-subheading leading-snug">
                    Controlled by your device's motion settings
                  </p>
                </div>
                <span
                  role="status"
                  aria-label={`Reduced motion is ${prefersReducedMotion ? "on" : "off"}`}
                  className={[
                    "mt-0.5 flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-pill text-[11px] font-semibold",
                    prefersReducedMotion
                      ? "bg-primary-50 text-primary"
                      : "bg-muted text-subheading",
                  ].join(" ")}
                >
                  {prefersReducedMotion ? "On" : "Off"}
                </span>
              </div>
            </li>
          </ul>
        </section>

        {/* ── Voice ───────────────────────────────────────────────────── */}
        <section aria-labelledby="sc-a11y-voice-heading">
          <p
            id="sc-a11y-voice-heading"
            className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-subheading"
          >
            Voice
          </p>

          <ul className="overflow-hidden rounded-card bg-white shadow-card">
            <li>
              <div className="flex items-start gap-3 px-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] font-medium text-heading">
                    {t("accessibility.voiceBooking")}
                  </p>
                  <p className="mt-0.5 text-[12px] text-subheading leading-snug">
                    {t("accessibility.voiceBookingHelp")}
                  </p>
                </div>
                <Toggle
                  checked={voiceEnabled}
                  onChange={setVoiceEnabled}
                  label={t("accessibility.voiceBooking")}
                />
              </div>
            </li>
          </ul>
        </section>

      </div>
    </div>
  );
}
