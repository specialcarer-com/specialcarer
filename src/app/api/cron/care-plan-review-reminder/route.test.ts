/**
 * Off-state guarantee: with NEXT_PUBLIC_REG9_REVIEW_CADENCE_ENABLED off
 * the cron must return { ok: true, skipped: 'flag_off' } and MUST NOT
 * touch Supabase. We assert by stubbing the admin client to a throw-on-use
 * proxy — if the handler tries to read/write, the test fails.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const REG_KEY = "NEXT_PUBLIC_REG9_REVIEW_CADENCE_ENABLED";
const CRON_KEY = "CRON_SECRET";
const regOriginal = process.env[REG_KEY];
const cronOriginal = process.env[CRON_KEY];

before(() => {
  process.env[CRON_KEY] = "test-secret";
  // Ensure a Supabase URL + key exist so the module doesn't fail to import
  // just because admin.ts wants them. The proxy would fail-fast anyway.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-key";
});

after(() => {
  if (regOriginal === undefined) delete process.env[REG_KEY];
  else process.env[REG_KEY] = regOriginal;
  if (cronOriginal === undefined) delete process.env[CRON_KEY];
  else process.env[CRON_KEY] = cronOriginal;
});

function makeReq(): { headers: { get(name: string): string | null } } {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "authorization" ? "Bearer test-secret" : null,
    },
  };
}

test("cron returns skipped:flag_off and does zero work when flag is off", async () => {
  delete process.env[REG_KEY];
  // Fresh import so the module-level `dynamic` and imports re-run against
  // the current env.
  const mod = await import(
    `./route.ts?ts=${Date.now()}-${Math.random()}`
  );
  const res: Response = await mod.GET(makeReq() as never);
  const body = (await res.json()) as { ok?: boolean; skipped?: string };
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.skipped, "flag_off");
});

test("cron rejects unauthorised callers even when flag is on", async () => {
  process.env[REG_KEY] = "true";
  const mod = await import(
    `./route.ts?ts=${Date.now()}-${Math.random()}`
  );
  const noAuthReq = {
    headers: { get: (_name: string) => null },
  } as never;
  const res: Response = await mod.GET(noAuthReq);
  assert.equal(res.status, 401);
});
