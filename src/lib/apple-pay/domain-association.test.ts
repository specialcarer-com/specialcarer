import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  APPLE_PAY_DOMAIN_ASSOCIATION_ENV,
  getDomainAssociation,
} from "./domain-association";

describe("getDomainAssociation", () => {
  it("returns ok with the body when env var is set", () => {
    const env = {
      [APPLE_PAY_DOMAIN_ASSOCIATION_ENV]: "7B227073704964223A22ABC123",
    };
    const result = getDomainAssociation(env);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body, "7B227073704964223A22ABC123");
    }
  });

  it("returns missing-env when env var is unset", () => {
    const env: Record<string, string | undefined> = {};
    const result = getDomainAssociation(env);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "missing-env");
    }
  });

  it("returns missing-env when env var is empty string", () => {
    const env = { [APPLE_PAY_DOMAIN_ASSOCIATION_ENV]: "" };
    const result = getDomainAssociation(env);
    assert.equal(result.ok, false);
  });

  it("returns missing-env when env var is whitespace only", () => {
    const env = { [APPLE_PAY_DOMAIN_ASSOCIATION_ENV]: "   \n  " };
    const result = getDomainAssociation(env);
    assert.equal(result.ok, false);
  });

  it("returns missing-env when env var is undefined", () => {
    const env = { [APPLE_PAY_DOMAIN_ASSOCIATION_ENV]: undefined };
    const result = getDomainAssociation(env);
    assert.equal(result.ok, false);
  });

  it("preserves the exact payload — does not trim or normalise", () => {
    // Apple's verifier is byte-strict; we must not mutate the payload.
    const padded = "  body-with-leading-and-trailing-space  ";
    const env = { [APPLE_PAY_DOMAIN_ASSOCIATION_ENV]: padded };
    const result = getDomainAssociation(env);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body, padded);
    }
  });

  it("defaults to process.env when no env arg is passed", () => {
    // Defensive: the function signature has a default value of
    // process.env. Just verify it doesn't throw when called bare.
    assert.doesNotThrow(() => {
      getDomainAssociation();
    });
  });
});
