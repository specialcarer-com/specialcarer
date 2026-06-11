/**
 * Mobile accessibility + voice string surface (gap 43 V1C).
 *
 * These namespaces migrated from the removed localStorage-based LocaleContext
 * (src/lib/i18n) into the next-intl message store. We render a thin consumer
 * through NextIntlClientProvider with the *real* message files to assert the
 * translated strings the /m accessibility settings and VoiceBookingFab now
 * pull via useTranslations("accessibility") / useTranslations("voice").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import enGB from "../../messages/en-GB.json";
import es from "../../messages/es.json";
import ur from "../../messages/ur.json";
import fr from "../../messages/fr.json";
import { deepMerge, type MessageTree } from "./messages";
import { type AppLocale } from "./config";

function A11yStrings() {
  const a11y = useTranslations("accessibility");
  const voice = useTranslations("voice");
  return h(
    Fragment,
    null,
    h("h1", { key: "settings" }, a11y("settings")),
    h("p", { key: "voiceBooking" }, a11y("voiceBooking")),
    h("span", { key: "listening" }, voice("listening")),
    h("span", { key: "notSupported" }, voice("notSupported")),
  );
}

function render(locale: AppLocale, messages: MessageTree): string {
  return renderToStaticMarkup(
    h(
      NextIntlClientProvider as never,
      { locale, messages, timeZone: "Europe/London" },
      h(A11yStrings),
    ),
  );
}

const MERGED: Partial<Record<AppLocale, MessageTree>> = {
  "en-GB": enGB as MessageTree,
  es: deepMerge(enGB as MessageTree, es as MessageTree),
  ur: deepMerge(enGB as MessageTree, ur as MessageTree),
  fr: deepMerge(enGB as MessageTree, fr as MessageTree),
};

test("accessibility + voice render en-GB strings", () => {
  const html = render("en-GB", MERGED["en-GB"]!);
  assert.match(html, /Accessibility/);
  assert.match(html, /Voice booking/);
  assert.match(html, /Listening/);
  assert.match(html, /Voice not supported on this device/);
});

test("accessibility + voice render es strings", () => {
  const html = render("es", MERGED.es!);
  assert.match(html, /Accesibilidad/);
  assert.match(html, /Reserva por voz/);
  assert.match(html, /Escuchando/);
});

test("accessibility + voice render ur strings", () => {
  const html = render("ur", MERGED.ur!);
  assert.match(html, /رسائی/);
  assert.match(html, /آواز سے بُکنگ/);
});

test("accessibility + voice render fr strings", () => {
  const html = render("fr", MERGED.fr!);
  assert.match(html, /Accessibilité/);
  assert.match(html, /Réservation vocale/);
});
