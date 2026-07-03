/**
 * Unit tests for Supabase session hydration before lock evaluation.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { waitForHydratedSession } from "../lock-session";
import { shouldLock } from "../lock-core";

describe("waitForHydratedSession", () => {
  it("returns true immediately when getSession already has a session", async () => {
    let subscribed = false;
    const result = await waitForHydratedSession({
      getSession: async () => true,
      subscribeInitialSession: () => {
        subscribed = true;
        return () => {};
      },
      timeoutMs: 50,
    });
    assert.equal(result, true);
    assert.equal(subscribed, false);
  });

  it("waits for INITIAL_SESSION when getSession is initially false", async () => {
    let getCalls = 0;
    const result = await waitForHydratedSession({
      getSession: async () => {
        getCalls += 1;
        return false;
      },
      subscribeInitialSession: (onResolved) => {
        setTimeout(() => onResolved(true), 10);
        return () => {};
      },
      timeoutMs: 500,
    });
    assert.equal(result, true);
    assert.equal(getCalls, 1);
  });

  it("falls back to false when hydration never arrives", async () => {
    const result = await waitForHydratedSession({
      getSession: async () => false,
      subscribeInitialSession: () => () => {},
      timeoutMs: 30,
    });
    assert.equal(result, false);
  });
});

describe("cold-start lock decision after session hydration", () => {
  it("reaches locked once hydration reports a session", async () => {
    let hydrated = false;
    const hasSession = await waitForHydratedSession({
      getSession: async () => false,
      subscribeInitialSession: (onResolved) => {
        setTimeout(() => {
          hydrated = true;
          onResolved(true);
        }, 10);
        return () => {};
      },
      timeoutMs: 500,
    });

    assert.equal(hydrated, true);
    assert.equal(
      shouldLock({
        hasSession,
        preferenceEnabled: true,
        capability: { available: true, kind: "face" },
      }),
      true,
    );
  });
});
