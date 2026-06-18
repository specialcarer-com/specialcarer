/**
 * Verifies the Sentry `beforeSend` PII scrubber removes sensitive fields from
 * an event before it leaves the app. Runs under `tsx` via the `test` npm
 * script. Importing the client config is safe: with no DSN set, `Sentry.init`
 * silently no-ops, and `window` is undefined under node so Replay stays off.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { beforeSend } from "../../../../sentry.client.config";
import { REDACTED } from "../scrub";

type Event = Record<string, any>;

function fixtureEvent(): Event {
  return {
    extra: {
      dob: "1988-07-14",
      ni_number: "QQ123456C",
      dbs_certificate_number: "001234567890",
      postcode: "SW1A 1AA",
      keep_me: "not-sensitive",
    },
    request: {
      headers: {
        cookie: "sb-access-token=secret; other=1",
        "user-agent": "Mozilla/5.0",
      },
    },
    breadcrumbs: [
      {
        category: "navigation",
        data: {
          address: { line1: "10 Downing Street", line2: "Flat 2" },
          postcode: "M1 1AE",
        },
      },
    ],
  };
}

test("beforeSend redacts DOB and NI number from extra", () => {
  const out = beforeSend!(fixtureEvent() as any, {}) as Event;
  assert.equal(out.extra.dob, REDACTED);
  assert.equal(out.extra.ni_number, REDACTED);
  assert.equal(out.extra.dbs_certificate_number, REDACTED);
});

test("beforeSend truncates a full postcode to its outward code", () => {
  const out = beforeSend!(fixtureEvent() as any, {}) as Event;
  assert.equal(out.extra.postcode, "SW1A");
  assert.equal(out.breadcrumbs[0].data.postcode, "M1");
});

test("beforeSend redacts the request cookie header", () => {
  const out = beforeSend!(fixtureEvent() as any, {}) as Event;
  assert.equal(out.request.headers.cookie, REDACTED);
  // Non-sensitive headers are preserved.
  assert.equal(out.request.headers["user-agent"], "Mozilla/5.0");
});

test("beforeSend redacts nested address lines in breadcrumbs", () => {
  const out = beforeSend!(fixtureEvent() as any, {}) as Event;
  assert.equal(out.breadcrumbs[0].data.address.line1, REDACTED);
  assert.equal(out.breadcrumbs[0].data.address.line2, REDACTED);
});

test("beforeSend leaves non-sensitive values untouched", () => {
  const out = beforeSend!(fixtureEvent() as any, {}) as Event;
  assert.equal(out.extra.keep_me, "not-sensitive");
});

test("beforeSend tolerates a null event", () => {
  assert.equal(beforeSend!(null as any, {}), null);
});
