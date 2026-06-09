/**
 * Soft-launch gate for /m/memberships.
 *
 * The page calls notFound() and the profile nav drops its Memberships row when
 * MEMBERSHIPS_ENABLED is false. Both read that single flag, so we assert the
 * flag's behaviour across the env states that gate the UI. (The page itself
 * pulls in "server-only" + Supabase via getMyMembership, which can't be
 * imported under node:test — the flag module is the honest unit to test.)
 *
 * The checkout API + Stripe webhook are intentionally NOT gated; they keep
 * their own coverage in ../../api/memberships/checkout/route.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const KEY = "NEXT_PUBLIC_MEMBERSHIPS_ENABLED";

async function loadFlag(value: string | undefined): Promise<boolean> {
  const prev = process.env[KEY];
  if (value === undefined) {
    delete process.env[KEY];
  } else {
    process.env[KEY] = value;
  }
  try {
    // Cache-bust so the top-level const re-evaluates against the current env.
    const mod = await import(
      `../../../lib/memberships/flag.ts?t=${Date.now()}-${value}`
    );
    return mod.MEMBERSHIPS_ENABLED as boolean;
  } finally {
    if (prev === undefined) {
      delete process.env[KEY];
    } else {
      process.env[KEY] = prev;
    }
  }
}

test("membership UI is hidden when the flag is unset (page -> 404)", async () => {
  assert.equal(await loadFlag(undefined), false);
});

test('membership UI is hidden when the flag is "false"', async () => {
  assert.equal(await loadFlag("false"), false);
});

test('membership UI is shown only when the flag is exactly "true"', async () => {
  assert.equal(await loadFlag("true"), true);
  // Anything other than the literal "true" stays gated.
  assert.equal(await loadFlag("1"), false);
  assert.equal(await loadFlag("TRUE"), false);
});
