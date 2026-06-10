/**
 * Header translation snapshot (gap 43 V1A).
 *
 * Renders the header's nav + CTA strings through NextIntlClientProvider with
 * the *real* message files, asserting the translated text per locale and the
 * resolved text direction (dir="rtl" for Urdu). We render a thin consumer that
 * uses the same namespaces/keys the live header does — the live SiteHeader
 * pulls in "server-only" Supabase and Next's router context, neither of which
 * loads under node:test, so this is the honest unit for the string surface.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import enGB from "../../messages/en-GB.json";
import es from "../../messages/es.json";
import ur from "../../messages/ur.json";
import de from "../../messages/de.json";
import { deepMerge, type MessageTree } from "./messages";
import { dirFor, type AppLocale } from "./config";

function HeaderStrings() {
  const nav = useTranslations("nav");
  const common = useTranslations("common");
  return h(
    Fragment,
    null,
    h("a", { key: "hiw" }, nav("howItWorks")),
    h("button", { key: "svc" }, nav("services")),
    h("a", { key: "cta" }, common("findCare")),
  );
}

function render(locale: AppLocale, messages: MessageTree): string {
  return renderToStaticMarkup(
    h(
      NextIntlClientProvider as never,
      { locale, messages, timeZone: "Europe/London" },
      h(HeaderStrings),
    ),
  );
}

const MERGED: Partial<Record<AppLocale, MessageTree>> = {
  "en-GB": enGB as MessageTree,
  es: deepMerge(enGB as MessageTree, es as MessageTree),
  ur: deepMerge(enGB as MessageTree, ur as MessageTree),
  de: deepMerge(enGB as MessageTree, de as MessageTree),
};

test("header renders en-GB strings, dir=ltr", () => {
  const html = render("en-GB", MERGED["en-GB"]!);
  assert.match(html, /How it works/);
  assert.match(html, /Services/);
  assert.match(html, /Find care/);
  assert.equal(dirFor("en-GB"), "ltr");
});

test("header renders es strings, dir=ltr", () => {
  const html = render("es", MERGED.es!);
  assert.match(html, /Cómo funciona/);
  assert.match(html, /Servicios/);
  assert.match(html, /Buscar cuidado/);
  assert.equal(dirFor("es"), "ltr");
});

test("header renders ur strings, dir=rtl", () => {
  const html = render("ur", MERGED.ur!);
  assert.match(html, /یہ کیسے کام کرتا ہے/);
  assert.match(html, /خدمات/);
  assert.match(html, /نگہداشت تلاش کریں/);
  assert.equal(dirFor("ur"), "rtl");
});

test("header renders de strings, dir=ltr", () => {
  const html = render("de", MERGED.de!);
  assert.match(html, /So funktioniert/);
  assert.match(html, /Leistungen/);
  assert.match(html, /Pflege finden/);
  assert.equal(dirFor("de"), "ltr");
});
