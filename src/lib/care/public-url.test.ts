import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { siteOrigin, publicProfileUrl } from "./public-url";

/**
 * The /c/<slug> alias and the public metadata builder rely on these helpers to
 * emit an absolute, non-empty canonical / og:url. A blank base URL must never
 * leak through as a relative or empty link (a crawler would then index the
 * wrong origin), so siteOrigin falls back to the production domain.
 */

const SAVED = {
  site: process.env.NEXT_PUBLIC_SITE_URL,
  app: process.env.NEXT_PUBLIC_APP_URL,
};

describe("siteOrigin / publicProfileUrl fallback", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    if (SAVED.site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = SAVED.site;
    if (SAVED.app === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = SAVED.app;
  });

  it("falls back to the production origin when no base URL is set", () => {
    assert.equal(siteOrigin(), "https://specialcarer.com");
  });

  it("treats a blank/whitespace base URL as unset", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "   ";
    assert.equal(siteOrigin(), "https://specialcarer.com");
  });

  it("never emits an empty or relative public profile url", () => {
    const url = publicProfileUrl({
      user_id: "11111111-1111-1111-1111-111111111111",
      public_slug: "priya-k-7f3a",
    });
    assert.ok(url.startsWith("https://"));
    assert.match(url, /\/c\/priya-k-7f3a$/);
  });
});
