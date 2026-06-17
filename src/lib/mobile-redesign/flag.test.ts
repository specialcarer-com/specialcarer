import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

const KEY = "NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED";
const original = process.env[KEY];

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

async function freshFlag() {
  // Bust the module cache so the top-level const re-reads process.env.
  const mod = await import(`./flag.ts?ts=${Date.now()}-${Math.random()}`);
  return mod as typeof import("./flag");
}

test("defaults to false when the env var is unset", async () => {
  delete process.env[KEY];
  const { isMobileRedesignEnabled, MOBILE_REDESIGN_ENABLED } =
    await freshFlag();
  assert.equal(isMobileRedesignEnabled(), false);
  assert.equal(MOBILE_REDESIGN_ENABLED, false);
});

test('is true only for the exact string "true"', async () => {
  process.env[KEY] = "true";
  const on = await freshFlag();
  assert.equal(on.isMobileRedesignEnabled(), true);

  process.env[KEY] = "1";
  const truthy = await freshFlag();
  assert.equal(truthy.isMobileRedesignEnabled(), false);

  process.env[KEY] = "false";
  const off = await freshFlag();
  assert.equal(off.isMobileRedesignEnabled(), false);
});
