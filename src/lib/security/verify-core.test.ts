/**
 * Unit tests for the 2FA verification decision core (gap 13).
 * Exercises the enrol-verify / disable / regenerate / sign-in-challenge logic
 * without touching Supabase or the DB, via injected ports.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideVerify, looksLikeTotp, type VerifyPorts } from "./verify-core";

function ports(over: Partial<VerifyPorts> = {}): VerifyPorts {
  return {
    verifyTotp: async () => false,
    consumeRecovery: async () => false,
    ...over,
  };
}

test("looksLikeTotp recognises 6-digit codes only", () => {
  assert.equal(looksLikeTotp("123456"), true);
  assert.equal(looksLikeTotp(" 123456 "), true);
  assert.equal(looksLikeTotp("12345"), false);
  assert.equal(looksLikeTotp("1234567"), false);
  assert.equal(looksLikeTotp("ABCD-1234"), false);
});

test("a valid TOTP code verifies via the TOTP port", async () => {
  let consumed = false;
  const out = await decideVerify(
    ports({ verifyTotp: async () => true, consumeRecovery: async () => { consumed = true; return true; } }),
    "123456",
    { allowRecovery: true },
  );
  assert.deepEqual(out, { ok: true, method: "totp" });
  assert.equal(consumed, false, "recovery must not be consumed when TOTP is supplied");
});

test("a wrong TOTP code fails and never falls back to recovery", async () => {
  const out = await decideVerify(
    ports({ verifyTotp: async () => false, consumeRecovery: async () => true }),
    "000000",
    { allowRecovery: true },
  );
  assert.deepEqual(out, { ok: false });
});

test("a recovery code is consumed when allowed", async () => {
  const out = await decideVerify(
    ports({ consumeRecovery: async () => true }),
    "ABCD-EFGH-IJKL",
    { allowRecovery: true },
  );
  assert.deepEqual(out, { ok: true, method: "recovery" });
});

test("a recovery code is rejected when recovery is disallowed (regenerate flow)", async () => {
  let attempted = false;
  const out = await decideVerify(
    ports({ consumeRecovery: async () => { attempted = true; return true; } }),
    "ABCD-EFGH-IJKL",
    { allowRecovery: false },
  );
  assert.deepEqual(out, { ok: false });
  assert.equal(attempted, false, "recovery port must not be called when disallowed");
});

test("an unmatched recovery code fails", async () => {
  const out = await decideVerify(
    ports({ consumeRecovery: async () => false }),
    "ZZZZ-ZZZZ",
    { allowRecovery: true },
  );
  assert.deepEqual(out, { ok: false });
});
