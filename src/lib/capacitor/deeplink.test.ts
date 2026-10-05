import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyDeeplink, pathFromAppUrl } from "./deeplink";

describe("classifyDeeplink", () => {
  it("routes in-app paths", () => {
    assert.deepEqual(classifyDeeplink("/m/bookings/abc"), {
      kind: "web",
      path: "/m/bookings/abc",
    });
  });

  it("strips same-origin https to a path", () => {
    assert.deepEqual(
      classifyDeeplink("https://www.specialcarer.com/m/chat/thread-1"),
      { kind: "web", path: "/m/chat/thread-1" },
    );
  });

  it("opens Stripe checkout externally", () => {
    const out = classifyDeeplink("https://checkout.stripe.com/c/pay/cs_test");
    assert.equal(out.kind, "external");
  });

  it("routes the singular apex domain in-app", () => {
    assert.deepEqual(
      classifyDeeplink("https://specialcarer.com/m/bookings/1?ref=push#details"),
      { kind: "web", path: "/m/bookings/1?ref=push#details" },
    );
  });

  it("does not treat the legacy plural domain as an in-app host", () => {
    for (const host of ["specialcarers.com", "www.specialcarers.com"]) {
      const url = `https://${host}/m/bookings/1`;
      assert.deepEqual(classifyDeeplink(url), { kind: "external", url });
    }
  });

  it("routes specialcarer:// custom scheme", () => {
    assert.deepEqual(classifyDeeplink("specialcarer://m/bookings/1"), {
      kind: "web",
      path: "/m/bookings/1",
    });
  });

  it("rejects javascript: URLs", () => {
    assert.equal(classifyDeeplink("javascript:alert(1)").kind, "invalid");
  });
});

describe("pathFromAppUrl", () => {
  it("returns null for external hosts", () => {
    assert.equal(pathFromAppUrl("https://accounts.google.com/o/oauth"), null);
  });
});
