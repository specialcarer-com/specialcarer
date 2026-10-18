import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideOnboardingAccount } from "./onboarding-account";

const ok = async () => ({ id: "acct_x" });

describe("decideOnboardingAccount", () => {
  it("creates when there is no stored account", async () => {
    assert.deepEqual(await decideOnboardingAccount(null, ok), {
      action: "create",
      replacesAccountId: null,
    });
  });

  it("reuses an account Stripe can still see", async () => {
    assert.deepEqual(await decideOnboardingAccount("acct_1ABC", ok), {
      action: "reuse",
      accountId: "acct_1ABC",
    });
  });

  it("replaces a placeholder id without calling Stripe", async () => {
    let called = false;
    const res = await decideOnboardingAccount("acct_demo_b077", async () => {
      called = true;
    });
    assert.equal(called, false);
    assert.deepEqual(res, { action: "create", replacesAccountId: "acct_demo_b077" });
  });

  it("replaces an account from another Stripe environment (resource_missing)", async () => {
    const res = await decideOnboardingAccount("acct_1OLD", async () => {
      throw Object.assign(new Error("No such account"), { code: "resource_missing" });
    });
    assert.deepEqual(res, { action: "create", replacesAccountId: "acct_1OLD" });
  });

  it("rethrows transient Stripe failures instead of replacing", async () => {
    await assert.rejects(
      decideOnboardingAccount("acct_1OK", async () => {
        throw Object.assign(new Error("boom"), { statusCode: 500 });
      }),
      /boom/,
    );
  });
});
