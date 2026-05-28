/**
 * P1-B10: off-platform detection unit tests.
 *
 * Covers each pattern's happy path plus the false-positive shapes that
 * tripped earlier hand-rolled detectors (date strings, the word
 * "number" inside benign phrases, etc.). When adding a pattern, add
 * BOTH a positive and a negative case here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectOffPlatform } from "./moderation";

function names(body: string): string[] {
  return detectOffPlatform(body).matches.map((m) => m.pattern);
}

describe("detectOffPlatform — positive cases", () => {
  it("matches a UK mobile starting 07", () => {
    const { matches } = detectOffPlatform("call me on 07123 456789 later");
    assert.equal(matches.length, 2); // mobile + "call me"
    assert.ok(matches.some((m) => m.pattern === "uk_mobile"));
  });

  it("matches a +44 mobile with the 44 prefix", () => {
    assert.ok(names("ring +44 7700 900123").includes("uk_mobile"));
  });

  it("matches whatsapp mention", () => {
    assert.deepEqual(names("ping me on whatsapp"), [
      "messaging_app_mention",
    ]);
  });

  it("matches wa.me short links", () => {
    assert.ok(names("wa.me/447700900123").includes("messaging_app_mention"));
  });

  it("matches an email address", () => {
    assert.ok(
      names("send to jane.doe+test@example.co.uk thanks").includes(
        "email_address",
      ),
    );
  });

  it("matches paypal.me", () => {
    assert.deepEqual(names("paypal.me/janed pls"), ["payment_handle"]);
  });

  it("matches venmo", () => {
    assert.deepEqual(names("send via Venmo"), ["payment_handle"]);
  });

  it("matches a UK sort code 12-34-56", () => {
    assert.ok(names("sort code 12-34-56 account 12345678").includes(
      "uk_sort_code",
    ));
  });

  it("matches a UK IBAN", () => {
    assert.ok(names("IBAN GB29NWBK60161331926819").includes("uk_iban"));
  });

  it("matches 'text me'", () => {
    assert.deepEqual(names("just text me about it"), [
      "off_platform_phrase",
    ]);
  });

  it("matches 'outside the app'", () => {
    assert.deepEqual(names("let's chat outside the app"), [
      "off_platform_phrase",
    ]);
  });

  it("matches 'my email'", () => {
    assert.deepEqual(names("my email is on my profile"), [
      "off_platform_phrase",
    ]);
  });

  it("buckets contact vs payment correctly", () => {
    const r = detectOffPlatform(
      "whatsapp me and paypal.me/abc and 07123 456789",
    );
    const byPattern = new Map(r.matches.map((m) => [m.pattern, m.reason]));
    assert.equal(byPattern.get("messaging_app_mention"), "off_platform_contact");
    assert.equal(byPattern.get("payment_handle"), "off_platform_payment");
    assert.equal(byPattern.get("uk_mobile"), "off_platform_contact");
  });

  it("dedupes by pattern name across repeated hits", () => {
    // Two emails — should still register email_address once.
    const r = detectOffPlatform(
      "a@b.com and c@d.com both work",
    );
    const emailHits = r.matches.filter((m) => m.pattern === "email_address");
    assert.equal(emailHits.length, 1);
  });
});

describe("detectOffPlatform — negative cases", () => {
  it("does not match 'my number one priority'", () => {
    assert.deepEqual(names("you are my number one priority"), []);
  });

  it("does not match an ISO date as a sort code", () => {
    // "2026-05-28" is 4-2-2, not 2-2-2 → no false hit.
    assert.deepEqual(names("scheduled for 2026-05-28"), []);
  });

  it("does not match a US-style date '9-12-1995'", () => {
    // 1-2-4 length pattern; sort-code regex requires 2-2-2.
    assert.deepEqual(names("born 9-12-1995"), []);
  });

  it("does not match plain numeric strings", () => {
    assert.deepEqual(names("the bill was 123456 pence"), []);
  });

  it("does not flag the literal word 'signal' inside an unrelated word", () => {
    // \b boundaries: "signals" → matches the stem; but "designal" would
    // not. Both confirm word-boundary behaviour. The first is intended
    // — "send me a signal" is the same risk vector as "signal app".
    // Keep the test honest: confirm a containing word is NOT a hit.
    assert.deepEqual(names("designaltimer is a product"), []);
  });

  it("empty/non-string returns no matches", () => {
    assert.deepEqual(detectOffPlatform("").matches, []);
    // @ts-expect-error — guarding the runtime path
    assert.deepEqual(detectOffPlatform(undefined).matches, []);
  });

  it("does not flag a benign greeting", () => {
    assert.deepEqual(names("Hi! Looking forward to meeting you."), []);
  });
});
