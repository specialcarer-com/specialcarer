/**
 * Locale-resolution tests (gap 43 V1A).
 *
 * Priority under test: profiles.chat_translate_to → NEXT_LOCALE cookie →
 * Accept-Language → 'en-GB'. Unsupported values at any tier are skipped so we
 * fall through rather than render a locale we don't ship.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLocale, matchAcceptLanguage } from "./resolve-locale";
import { DEFAULT_LOCALE } from "./config";

test("defaults to en-GB when no signal is present", () => {
  assert.equal(resolveLocale({}), "en-GB");
  assert.equal(DEFAULT_LOCALE, "en-GB");
});

test("Accept-Language is used when no cookie or profile", () => {
  assert.equal(
    resolveLocale({ acceptLanguage: "es-ES,es;q=0.9,en;q=0.5" }),
    "es",
  );
});

test("cookie wins over Accept-Language", () => {
  assert.equal(
    resolveLocale({
      cookieLocale: "ur",
      acceptLanguage: "es-ES,es;q=0.9",
    }),
    "ur",
  );
});

test("profile wins over both cookie and Accept-Language", () => {
  assert.equal(
    resolveLocale({
      profileLocale: "es",
      cookieLocale: "ur",
      acceptLanguage: "en-GB",
    }),
    "es",
  );
});

test("unsupported profile locale is skipped, falls through to cookie", () => {
  // 'ja' is neither a shipped UI locale nor a chat-translate target.
  assert.equal(
    resolveLocale({ profileLocale: "ja", cookieLocale: "es" }),
    "es",
  );
});

test("unsupported cookie is skipped, falls through to Accept-Language", () => {
  assert.equal(
    resolveLocale({ cookieLocale: "ja", acceptLanguage: "ur-PK" }),
    "ur",
  );
});

test("newly shipped locales resolve directly", () => {
  // PR B ships pl/de/fr/ro/bn/en-US — these now win at their tier.
  assert.equal(resolveLocale({ profileLocale: "pl", cookieLocale: "es" }), "pl");
  assert.equal(resolveLocale({ cookieLocale: "de" }), "de");
  assert.equal(resolveLocale({ profileLocale: "fr" }), "fr");
});

test("matchAcceptLanguage honours q-weights and prefix matching", () => {
  // Highest-q supported tag wins.
  assert.equal(matchAcceptLanguage("fr;q=0.2,es;q=0.8"), "es");
  // en-US now ships, so it exact-matches ahead of the en-GB prefix fallback.
  assert.equal(matchAcceptLanguage("en-US,en;q=0.9"), "en-US");
  // A bare/regional English with no en-US tag still prefix-maps to en-GB.
  assert.equal(matchAcceptLanguage("en-AU,en;q=0.9"), "en-GB");
  assert.equal(matchAcceptLanguage("ja,ko;q=0.5"), null);
  assert.equal(matchAcceptLanguage(""), null);
  assert.equal(matchAcceptLanguage(null), null);
});
