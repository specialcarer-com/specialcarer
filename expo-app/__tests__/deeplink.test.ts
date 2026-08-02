import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildNavigationScript,
  classifyDeeplink,
  WEB_DEEPLINK_ORIGIN_DEFAULT,
} from "../src/deeplink";

describe("buildNavigationScript", () => {
  it("produces a syntactically well-formed assignment", () => {
    const js = buildNavigationScript("/m/chat/abc-123");
    assert.equal(js, `window.location.href = "/m/chat/abc-123"; true;`);
  });

  it("escapes single quotes so the deeplink cannot break out of the JS string", () => {
    // This is the headline case from the PR brief: the deeplink "/m/chat/it's-a-test"
    // must not produce a JS snippet that breaks out of its string literal.
    const js = buildNavigationScript("/m/chat/it's-a-test");
    // JSON.stringify wraps in double quotes; the apostrophe survives un-escaped
    // but cannot terminate the string.
    assert.equal(js, `window.location.href = "/m/chat/it's-a-test"; true;`);
    // Sanity: eval'ing the script in a JS host would parse cleanly. We
    // simulate by re-parsing the embedded literal back to a string.
    const literal = js.match(/window\.location\.href = (".*?"); true;/);
    assert.ok(literal, "expected a quoted string literal in the snippet");
    assert.equal(JSON.parse(literal![1]!), "/m/chat/it's-a-test");
  });

  it("escapes double quotes embedded in the deeplink", () => {
    const js = buildNavigationScript('/m/chat/he-said-"hi"');
    const literal = js.match(/window\.location\.href = (.+?); true;/);
    assert.ok(literal);
    assert.equal(JSON.parse(literal![1]!), '/m/chat/he-said-"hi"');
  });

  it("escapes backslashes and control characters", () => {
    const js = buildNavigationScript("/m/chat/a\\b\nc");
    const literal = js.match(/window\.location\.href = (.+?); true;/);
    assert.ok(literal);
    assert.equal(JSON.parse(literal![1]!), "/m/chat/a\\b\nc");
  });

  it("escapes </script> so the injection survives an HTML-embedded context", () => {
    // Belt-and-braces: even though injectJavaScript runs the snippet outside
    // any <script> tag, we don't want a script-close in user data to ever
    // matter. JSON.stringify leaves </script> intact — assert that nothing
    // worse happens (no premature termination).
    const js = buildNavigationScript("/m/chat/</script>");
    assert.ok(
      js.includes('"/m/chat/</script>"'),
      "expected literal to contain the script tag, untouched",
    );
  });
});

describe("classifyDeeplink", () => {
  it("treats a leading-slash path as an in-app web route", () => {
    assert.deepEqual(classifyDeeplink("/m/chat/abc-123"), {
      kind: "web",
      path: "/m/chat/abc-123",
    });
  });

  it("treats tel:, mailto:, sms: as external", () => {
    assert.deepEqual(classifyDeeplink("tel:+441234567890"), {
      kind: "external",
      url: "tel:+441234567890",
    });
    assert.deepEqual(classifyDeeplink("mailto:help@specialcarer.com"), {
      kind: "external",
      url: "mailto:help@specialcarer.com",
    });
    assert.deepEqual(classifyDeeplink("sms:+441234567890"), {
      kind: "external",
      url: "sms:+441234567890",
    });
  });

  it("strips an absolute URL on the configured web origin back to a path", () => {
    assert.deepEqual(
      classifyDeeplink(`${WEB_DEEPLINK_ORIGIN_DEFAULT}/m/track/xyz?ref=push`),
      { kind: "web", path: "/m/track/xyz?ref=push" },
    );
  });

  it("routes a different http(s) host externally", () => {
    assert.deepEqual(classifyDeeplink("https://example.com/whatever"), {
      kind: "external",
      url: "https://example.com/whatever",
    });
  });

  it("returns invalid for non-strings, empty strings, and gibberish schemes", () => {
    assert.equal(classifyDeeplink(undefined).kind, "invalid");
    assert.equal(classifyDeeplink(null).kind, "invalid");
    assert.equal(classifyDeeplink(42).kind, "invalid");
    assert.equal(classifyDeeplink("").kind, "invalid");
    assert.equal(classifyDeeplink("   ").kind, "invalid");
    assert.equal(classifyDeeplink("javascript:alert(1)").kind, "invalid");
    assert.equal(classifyDeeplink("not-a-url").kind, "invalid");
  });

  it("respects a custom webOrigin override", () => {
    assert.deepEqual(
      classifyDeeplink("https://staging.specialcarer.com/m/x", "https://staging.specialcarer.com"),
      { kind: "web", path: "/m/x" },
    );
    assert.deepEqual(
      classifyDeeplink("https://specialcarer.com/m/x", "https://staging.specialcarer.com"),
      { kind: "external", url: "https://specialcarer.com/m/x" },
    );
  });
});
